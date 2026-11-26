import { expect } from 'chai';
import 'mocha';
import {
    buildEnumStates,
    buildOidGroups,
    determineStateRole,
    escapeXml,
    extractOidIndex,
    getEnumKeys,
    normalizeBaseUrl,
    padId,
    parseFiniteNumber,
} from './lib/util';
import type { DigestHttpClient } from './lib/web2commClient';
import {
    buildGetDpSoapBody,
    buildWriteDpSoapBody,
    parseGetDpResponseXml,
    parseOidEnumsXml,
    parseOidNamesXml,
    Web2CommClient,
} from './lib/web2commClient';

const createMockResponse = (
    body: string,
    init: { ok?: boolean; status?: number; statusText?: string } = {},
): Response & { bodyConsumed: boolean } => {
    let consumed = false;
    const response = {
        ok: init.ok ?? true,
        status: init.status ?? (init.ok === false ? 500 : 200),
        statusText: init.statusText ?? (init.ok === false ? 'Internal Server Error' : 'OK'),
        text(): Promise<string> {
            consumed = true;
            return Promise.resolve(body);
        },
        json(): Promise<unknown> {
            consumed = true;
            return Promise.resolve(JSON.parse(body));
        },
        get bodyConsumed(): boolean {
            return consumed;
        },
    };
    return response as unknown as Response & { bodyConsumed: boolean };
};

describe('util functions', () => {
    describe('escapeXml', () => {
        it('should escape all XML special characters', () => {
            expect(escapeXml(`<tag attr="a&b">'test'</tag>`)).to.equal(
                '&lt;tag attr=&quot;a&amp;b&quot;&gt;&apos;test&apos;&lt;/tag&gt;',
            );
        });
    });

    describe('normalizeBaseUrl', () => {
        it('should add http:// and trim whitespace and trailing slashes', () => {
            expect(normalizeBaseUrl('  192.168.1.108/  ')).to.equal('http://192.168.1.108');
            expect(normalizeBaseUrl('http://192.168.1.108:8080///')).to.equal('http://192.168.1.108:8080');
            expect(normalizeBaseUrl('https://heatpump.local/')).to.equal('https://heatpump.local');
        });
    });

    describe('parseFiniteNumber', () => {
        it('should parse valid numeric strings and reject empty or non-numeric strings', () => {
            expect(parseFiniteNumber('21.5')).to.equal(21.5);
            expect(parseFiniteNumber(' -3 ')).to.equal(-3);
            expect(parseFiniteNumber('0')).to.equal(0);
            expect(parseFiniteNumber('')).to.equal(undefined);
            expect(parseFiniteNumber('   ')).to.equal(undefined);
            expect(parseFiniteNumber('---')).to.equal(undefined);
            expect(parseFiniteNumber('NaN')).to.equal(undefined);
            expect(parseFiniteNumber('Infinity')).to.equal(undefined);
        });
    });

    describe('getEnumKeys', () => {
        it('should extract enum keys from a valid prop string', () => {
            expect(getEnumKeys('-rw enum = 0,1,2')).to.deep.equal(['0', '1', '2']);
        });

        it('should handle spaces around equals, commas, and trailing whitespace', () => {
            expect(getEnumKeys('-rw enum=0, 1, 2  ')).to.deep.equal(['0', '1', '2']);
            expect(getEnumKeys('-rw enum = 0,1,')).to.deep.equal(['0', '1']);
        });

        it('should return null when no enum is present or empty', () => {
            expect(getEnumKeys('-rw float')).to.equal(null);
            expect(getEnumKeys('-rw enum = ,')).to.equal(null);
        });
    });

    describe('extractOidIndex', () => {
        it('should extract the trailing index from an OID path', () => {
            expect(extractOidIndex('/1/2/3/5/10')).to.equal('10');
            expect(extractOidIndex('/1/2/3/5/8')).to.equal('8');
            expect(extractOidIndex('/1/2/3/5/8/')).to.equal('8');
            expect(extractOidIndex('42')).to.equal('42');
        });
    });

    describe('padId', () => {
        it('should pad single-digit IDs with a leading zero', () => {
            expect(padId('1')).to.equal('01');
            expect(padId('12')).to.equal('12');
            expect(padId('')).to.equal('');
        });
    });

    describe('determineStateRole', () => {
        it('should assign temperature roles for °C and K', () => {
            expect(determineStateRole('°C', false)).to.equal('value.temperature');
            expect(determineStateRole('°C', true)).to.equal('level.temperature');
            expect(determineStateRole(' K ', false)).to.equal('value.temperature');
        });

        it('should assign physical unit roles appropriately', () => {
            expect(determineStateRole('bar', false)).to.equal('value.pressure');
            expect(determineStateRole('bar', true)).to.equal('level.pressure');
            expect(determineStateRole('kWh', false)).to.equal('value.energy');
            expect(determineStateRole('W', false)).to.equal('value.power');
            expect(determineStateRole('V', false)).to.equal('value.voltage');
            expect(determineStateRole('A', false)).to.equal('value.current');
            expect(determineStateRole('Hz', false)).to.equal('value.frequency');
            expect(determineStateRole('', false)).to.equal('value');
            expect(determineStateRole('', true)).to.equal('level');
        });
    });

    describe('buildEnumStates', () => {
        const enumsDict: Record<string, (string | null | undefined)[]> = {
            '01:02': ['Off', 'On', 'Auto'],
            '01:03': ['Off', null, 'Auto'],
        };

        it('should build subset of states for Enum Var', () => {
            const states = buildEnumStates({ name: '01:02', desc: 'Enum Var', prop: '-rw enum = 0,2' }, enumsDict);
            expect(states).to.deep.equal({ 0: 'Off', 2: 'Auto' });
        });

        it('should build all states for non-Enum Var', () => {
            const states = buildEnumStates({ name: '01:02', desc: 'Other', prop: '-r-' }, enumsDict);
            expect(states).to.deep.equal({ 0: 'Off', 1: 'On', 2: 'Auto' });
        });

        it('should skip null/undefined holes consistently after JSON round-trip', () => {
            const sparse: string[] = [];
            sparse[0] = 'Off';
            sparse[2] = 'Auto';
            const roundTripped = JSON.parse(JSON.stringify({ '01:03': sparse })) as Record<
                string,
                (string | null | undefined)[]
            >;
            const inMemory = buildEnumStates({ name: '01:03', desc: 'Other', prop: '-r-' }, { '01:03': sparse });
            const fromJson = buildEnumStates({ name: '01:03', desc: 'Other', prop: '-r-' }, roundTripped);
            expect(inMemory).to.deep.equal({ 0: 'Off', 2: 'Auto' });
            expect(fromJson).to.deep.equal({ 0: 'Off', 2: 'Auto' });
        });

        it('should omit missing enum indices instead of emitting "undefined"', () => {
            const states = buildEnumStates({ name: '01:03', desc: 'Enum Var', prop: '-rw enum = 0,1,2' }, enumsDict);
            expect(states).to.deep.equal({ 0: 'Off', 2: 'Auto' });
        });

        it('should return undefined if name is not in dictionary', () => {
            const states = buildEnumStates({ name: '99:99', desc: 'Enum Var', prop: '-rw enum = 0' }, enumsDict);
            expect(states).to.equal(undefined);
        });
    });

    describe('buildOidGroups', () => {
        it('should group enabled OIDs by group number, trim OIDs, and deduplicate within same group', () => {
            const oids: ioBroker.OID[] = [
                { enabled: true, oid: ' /1/2/1 ', name: 'A', isStatus: false, group: 0 },
                { enabled: false, oid: '/1/2/2', name: 'B', isStatus: false, group: 0 },
                { enabled: true, oid: '/1/2/1', name: 'A dup', isStatus: false, group: 0 },
                { enabled: true, oid: '/1/2/3', name: 'C', isStatus: true, group: 0 },
                { enabled: true, oid: '', name: 'Empty', isStatus: false, group: 0 },
                { enabled: true, oid: '/1/2/4', name: 'D', isStatus: false, group: 2 },
                { enabled: true, oid: '/1/2/1', name: 'A on-demand', isStatus: false, group: 10 },
                { enabled: true, oid: '/1/2/5', name: 'Bad group', isStatus: false, group: -1 },
            ];
            const { oidGroups, groupOidString } = buildOidGroups(oids);
            expect(oidGroups).to.deep.equal({
                0: [0, 3],
                2: [5],
                10: [6],
            });
            expect(groupOidString).to.deep.equal({
                0: '/1/2/1;/1/2/3',
                2: '/1/2/4',
                10: '/1/2/1',
            });
        });

        it('should return empty objects when input is undefined or empty', () => {
            expect(buildOidGroups(undefined)).to.deep.equal({ oidGroups: {}, groupOidString: {} });
            expect(buildOidGroups([])).to.deep.equal({ oidGroups: {}, groupOidString: {} });
        });
    });
});

describe('web2comm XML, SOAP & HTTP client', () => {
    it('should build escaped getDpRequest and writeDpRequest SOAP payloads', () => {
        const getBody = buildGetDpSoapBody('/1/2/3;/1/2/4');
        expect(getBody).to.include('<oid>/1/2/3;/1/2/4</oid>');

        const writeBody = buildWriteDpSoapBody('/1/2/15', 21.5);
        expect(writeBody).to.include('<oid>/1/2/15</oid>');
        expect(writeBody).to.include('<index>15</index>');
        expect(writeBody).to.include('<value>21.5</value>');

        const escapedBody = buildWriteDpSoapBody('/1/2/<bad>&1', 'a<b&c');
        expect(escapedBody).to.include('<oid>/1/2/&lt;bad&gt;&amp;1</oid>');
        expect(escapedBody).to.include('<value>a&lt;b&amp;c</value>');
    });

    it('should parse VarIdentTexte XML into OID names dictionary and skip empty entries', async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <VarIdentTexte>
            <gn id="1">
                <mn id="2">Außentemperatur</mn>
                <mn id="12">Vorlauftemperatur</mn>
                <mn id="13"/>
            </gn>
        </VarIdentTexte>`;
        const dict = await parseOidNamesXml(xml);
        expect(dict).to.deep.equal({
            '01:02': 'Außentemperatur',
            '01:12': 'Vorlauftemperatur',
        });
    });

    it('should parse AufzaehlTexte XML into OID enums dictionary and ignore negative/empty indices', async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <AufzaehlTexte>
            <gn id="1">
                <mn id="5">
                    <enum id="0">Aus</enum>
                    <enum id="1">Ein</enum>
                    <enum id="-1">Invalid</enum>
                    <enum id="2"/>
                </mn>
            </gn>
        </AufzaehlTexte>`;
        const dict = await parseOidEnumsXml(xml);
        expect(dict).to.deep.equal({
            '01:05': ['Aus', 'Ein'],
        });
    });

    it('should parse SOAP getDpResponse XML and handle xsi:nil empty elements', async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://ws01.lom.ch/soap/">
            <SOAP-ENV:Body>
                <ns:getDpResponse>
                    <dpCfg>
                        <name>01:02</name>
                        <prop>-rw</prop>
                        <desc>Temp</desc>
                        <value>22.5</value>
                        <unit>°C</unit>
                        <step>0.5</step>
                        <minValue>10</minValue>
                        <maxValue>30</maxValue>
                    </dpCfg>
                    <dpCfg>
                        <name>01:03</name>
                        <prop>-r-</prop>
                        <desc>Empty</desc>
                        <value xsi:nil="true"/>
                    </dpCfg>
                </ns:getDpResponse>
            </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`;
        const points = await parseGetDpResponseXml(xml);
        expect(points).to.have.lengthOf(2);
        expect(points[0]).to.deep.equal({
            name: '01:02',
            prop: '-rw',
            desc: 'Temp',
            value: '22.5',
            unit: '°C',
            step: '0.5',
            min: '10',
            max: '30',
        });
        expect(points[1].value).to.equal('');
    });

    it('should throw an error when getDpResponse contains a SOAP Fault', async () => {
        const faultXml = `<?xml version="1.0" encoding="UTF-8"?>
        <SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
            <SOAP-ENV:Body>
                <SOAP-ENV:Fault>
                    <faultcode>SOAP-ENV:Server</faultcode>
                    <faultstring>Invalid OID</faultstring>
                </SOAP-ENV:Fault>
            </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`;

        let caught: Error | undefined;
        try {
            await parseGetDpResponseXml(faultXml);
        } catch (err) {
            caught = err as Error;
        }
        expect(caught).to.be.an('error');
        expect(caught?.message).to.include('Invalid OID');
    });

    describe('Web2CommClient HTTP operations', () => {
        it('should use fresh GET options per call and not leak mutated headers', async () => {
            const seenOptions: Record<string, unknown>[] = [];
            const mockHttp: DigestHttpClient = {
                fetch(_url, options = {}) {
                    seenOptions.push(options);
                    // Simulate digest-fetch mutating options.headers in place
                    (options.headers as Record<string, string>).Authorization = 'Digest stale';
                    return Promise.resolve(createMockResponse(JSON.stringify({ device: 'Ochsner', version: '1.2' })));
                },
            };

            const client = new Web2CommClient(' http://192.168.1.108/ ', 'USER', 'secret', { httpClient: mockHttp });
            const info1 = await client.fetchDeviceInfo();
            const info2 = await client.fetchDeviceInfo();

            expect(info1).to.deep.equal({ device: 'Ochsner', version: '1.2' });
            expect(info2).to.deep.equal({ device: 'Ochsner', version: '1.2' });
            expect(seenOptions).to.have.lengthOf(2);
            expect(seenOptions[0]).to.not.equal(seenOptions[1]);
            expect(seenOptions[0].headers).to.not.equal(seenOptions[1].headers);
            expect(seenOptions[0].method).to.equal('GET');
        });

        it('should compute UTF-8 byte Content-Length and consume write response body', async () => {
            let capturedHeaders: Record<string, string> = {};
            let capturedBody = '';
            const mockResponse = createMockResponse('<ok/>');
            const mockHttp: DigestHttpClient = {
                fetch(_url, options = {}) {
                    capturedHeaders = options.headers as Record<string, string>;
                    capturedBody = typeof options.body === 'string' ? options.body : '';
                    return Promise.resolve(mockResponse);
                },
            };

            const client = new Web2CommClient('192.168.1.108', 'USER', 'secret', { httpClient: mockHttp });
            const result = await client.writeDataPoint('/1/2/3', 'äöü°C');

            expect(result.ok).to.equal(true);
            expect(mockResponse.bodyConsumed).to.equal(true);
            expect(capturedHeaders['Content-Length']).to.equal(String(Buffer.byteLength(capturedBody, 'utf8')));
            expect(Number(capturedHeaders['Content-Length'])).to.be.greaterThan(capturedBody.length);
        });

        it('should detect SOAP Faults in writeDataPoint responses', async () => {
            const faultXml = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
                <SOAP-ENV:Body>
                    <SOAP-ENV:Fault>
                        <faultcode>Client</faultcode>
                        <faultstring>Read-only datapoint</faultstring>
                    </SOAP-ENV:Fault>
                </SOAP-ENV:Body>
            </SOAP-ENV:Envelope>`;
            const mockHttp: DigestHttpClient = {
                fetch() {
                    return Promise.resolve(createMockResponse(faultXml, { ok: true, status: 200 }));
                },
            };

            const client = new Web2CommClient('192.168.1.108', 'USER', 'secret', { httpClient: mockHttp });
            const result = await client.writeDataPoint('/1/2/3', 20);
            expect(result.ok).to.equal(false);
            expect(result.statusText).to.include('Read-only datapoint');
        });

        it('should abort in-flight requests on timeout and on client.abort()', async () => {
            const mockHttp: DigestHttpClient = {
                fetch(_url, options = {}) {
                    const signal = options.signal as AbortSignal;
                    return new Promise<Response>((_resolve, reject) => {
                        signal.addEventListener('abort', () => reject(new Error('Aborted')));
                    });
                },
            };

            const client = new Web2CommClient('192.168.1.108', 'USER', 'secret', {
                httpClient: mockHttp,
                timeoutMs: 30,
            });
            let timeoutErr: Error | undefined;
            try {
                await client.fetchDeviceInfo();
            } catch (err) {
                timeoutErr = err as Error;
            }
            expect(timeoutErr?.message).to.equal('Aborted');

            const longClient = new Web2CommClient('192.168.1.108', 'USER', 'secret', {
                httpClient: mockHttp,
                timeoutMs: 60_000,
            });
            const promise = longClient.fetchDeviceInfo();
            longClient.abort();
            let abortErr: Error | undefined;
            try {
                await promise;
            } catch (err) {
                abortErr = err as Error;
            }
            expect(abortErr).to.be.an('error');
            expect(abortErr?.message.toLowerCase()).to.include('abort');
        });

        it('should throw HTTP status error on failed fetchDeviceInfo / readDataPoints', async () => {
            const mockHttp: DigestHttpClient = {
                fetch() {
                    return Promise.resolve(
                        createMockResponse('Unauthorized', { ok: false, status: 401, statusText: 'Unauthorized' }),
                    );
                },
            };

            const client = new Web2CommClient('192.168.1.108', 'USER', 'wrong', { httpClient: mockHttp });
            let err1: Error | undefined;
            try {
                await client.fetchDeviceInfo();
            } catch (err) {
                err1 = err as Error;
            }
            expect(err1?.message).to.include('401');

            let err2: Error | undefined;
            try {
                await client.readDataPoints('/1/2/3');
            } catch (err) {
                err2 = err as Error;
            }
            expect(err2?.message).to.include('401');
        });
    });
});

interface TestAdapterHarness {
    instance: Record<string, any>;
    states: Map<string, { val: ioBroker.StateValue; ack: boolean }>;
    objects: Map<string, Record<string, unknown>>;
    files: Map<string, string>;
    foreignObjects: Map<string, Record<string, any>>;
    sentMessages: Array<{ from: string; command: string; message: unknown; callback: unknown }>;
    activeTimers: Map<number, { fn: (...args: unknown[]) => void; delay: number }>;
    clearedTimers: number[];
    logs: { debug: string[]; info: string[]; warn: string[]; error: string[] };
}

const loadMainModuleWithMockAdapterCore = (): { OchsnerRoomterminal: { prototype: Record<string, unknown> } } => {
    const adapterCorePath = require.resolve('@iobroker/adapter-core');
    const mainPath = require.resolve('./main');
    if (!require.cache[mainPath]) {
        require.cache[adapterCorePath] = {
            id: adapterCorePath,
            filename: adapterCorePath,
            loaded: true,
            exports: {
                Adapter: class MockAdapterBase {},
            },
        } as unknown as NodeJS.Module;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./main') as { OchsnerRoomterminal: { prototype: Record<string, unknown> } };
};

/**
 * Builds an isolated OchsnerRoomterminal instance with in-memory ioBroker Adapter mocks.
 *
 * @param config - Partial adapter configuration overrides
 * @param mockClient - Optional mocked `Web2CommClient` methods
 * @returns Test harness containing the instance and captured mock calls
 */
const createAdapterHarness = (
    config: Partial<ioBroker.AdapterConfig>,
    mockClient?: Partial<Web2CommClient>,
): TestAdapterHarness => {
    const mainExport = loadMainModuleWithMockAdapterCore();
    const instance = Object.create(mainExport.OchsnerRoomterminal.prototype) as Record<string, any>;

    const states = new Map<string, { val: ioBroker.StateValue; ack: boolean }>();
    const objects = new Map<string, Record<string, unknown>>();
    const files = new Map<string, string>();
    const foreignObjects = new Map<string, Record<string, any>>();
    const sentMessages: Array<{ from: string; command: string; message: unknown; callback: unknown }> = [];
    const activeTimers = new Map<number, { fn: (...args: unknown[]) => void; delay: number }>();
    const clearedTimers: number[] = [];
    const logs = { debug: [] as string[], info: [] as string[], warn: [] as string[], error: [] as string[] };
    let nextTimerId = 1;

    // Initialize instance fields normally set by class field initializers
    instance.client = undefined;
    instance.oidNamesDict = {};
    instance.oidEnumsDict = {};
    instance.oidUpdate = {};
    instance.oidGroups = {};
    instance.groupOidString = {};
    instance.pollTimeout = undefined;
    instance.reconnectTimeout = undefined;
    instance.writeReadbackTimeouts = new Map();
    instance.isUnloading = false;

    instance.name = 'ochsner-roomterminal';
    instance.namespace = 'ochsner-roomterminal.0';
    instance.config = {
        username: 'USER',
        password: 'pw',
        serverIP: '192.168.1.108',
        pollInterval: 30,
        OIDs: [],
        ...config,
    };
    instance.log = {
        debug: (msg: string) => logs.debug.push(msg),
        info: (msg: string) => logs.info.push(msg),
        warn: (msg: string) => logs.warn.push(msg),
        error: (msg: string) => logs.error.push(msg),
    };
    instance.subscribeStates = () => undefined;
    instance.setStateChangedAsync = (
        id: string,
        stateOrVal: ioBroker.StateValue | { val: ioBroker.StateValue; ack?: boolean },
        ack?: boolean,
    ): Promise<void> => {
        if (stateOrVal !== null && typeof stateOrVal === 'object' && 'val' in stateOrVal) {
            states.set(id, { val: stateOrVal.val, ack: Boolean(stateOrVal.ack) });
        } else {
            states.set(id, { val: stateOrVal, ack: Boolean(ack) });
        }
        return Promise.resolve();
    };
    instance.setObjectNotExistsAsync = (id: string, obj: Record<string, unknown>): Promise<void> => {
        if (!objects.has(id)) {
            objects.set(id, obj);
        }
        return Promise.resolve();
    };
    instance.getForeignObjectAsync = (id: string): Promise<Record<string, any> | undefined> =>
        Promise.resolve(foreignObjects.get(id));
    instance.setForeignObjectAsync = (id: string, obj: Record<string, any>): Promise<void> => {
        foreignObjects.set(id, obj);
        return Promise.resolve();
    };
    instance.fileExistsAsync = (_ns: string, fileName: string): Promise<boolean> =>
        Promise.resolve(files.has(fileName));
    instance.readFileAsync = (_ns: string, fileName: string): Promise<{ file: Buffer }> =>
        Promise.resolve({ file: Buffer.from(files.get(fileName) ?? '', 'utf8') });
    instance.writeFileAsync = (_ns: string, fileName: string, data: string): Promise<void> => {
        files.set(fileName, data);
        return Promise.resolve();
    };
    instance.sendTo = (from: string, command: string, message: unknown, callback: unknown) => {
        sentMessages.push({ from, command, message, callback });
    };
    instance.setTimeout = (fn: (...args: unknown[]) => void, delay: number) => {
        const id = nextTimerId++;
        activeTimers.set(id, { fn, delay });
        return id;
    };
    instance.clearTimeout = (id: number) => {
        activeTimers.delete(id);
        clearedTimers.push(id);
    };

    if (mockClient) {
        instance.createClient = () => mockClient;
    }

    return {
        instance,
        states,
        objects,
        files,
        foreignObjects,
        sentMessages,
        activeTimers,
        clearedTimers,
        logs,
    };
};

describe('OchsnerRoomterminal adapter lifecycle & handlers', () => {
    it('should abort startup when serverIP is empty', async () => {
        const harness = createAdapterHarness({ serverIP: '   ' });
        await harness.instance.main();

        expect(harness.states.get('info.connection')).to.deep.equal({ val: false, ack: true });
        expect(harness.logs.error.some(m => m.includes('must not be empty'))).to.equal(true);
        expect(harness.activeTimers.size).to.equal(0);
    });

    it('should schedule reconnect retry when initial connection fails', async () => {
        const harness = createAdapterHarness(
            { pollInterval: 10 },
            {
                fetchDeviceInfo: () => Promise.reject(new Error('ECONNREFUSED')),
            },
        );

        await harness.instance.main();
        expect(harness.states.get('info.connection')).to.deep.equal({ val: false, ack: true });
        expect(harness.logs.error.some(m => m.includes('ECONNREFUSED'))).to.equal(true);
        expect(harness.activeTimers.size).to.equal(1);
    });

    it('should handle onMessage readGroup including numeric group 0 and invalid commands', async () => {
        let readArgs: string | undefined;
        const harness = createAdapterHarness(
            {
                OIDs: [{ enabled: true, oid: '/1/2/3', name: 'Temp', isStatus: false, group: 0 }],
            },
            {
                readDataPoints: (oids: string) => {
                    readArgs = oids;
                    return Promise.resolve({
                        rawXml: '<xml/>',
                        dataPoints: [
                            {
                                name: '01:02',
                                prop: '-r-',
                                desc: 'Temp',
                                value: '21.5',
                                unit: '°C',
                                step: '',
                                min: '',
                                max: '',
                            },
                        ],
                    });
                },
            },
        );
        harness.instance.client = harness.instance.createClient();
        harness.instance.oidGroups = { 0: [0] };
        harness.instance.groupOidString = { 0: '/1/2/3' };

        await harness.instance.onMessage({ from: 'script.0', command: 'readGroup', message: 0, callback: 'cb1' });
        expect(readArgs).to.equal('/1/2/3');
        expect(harness.sentMessages[0].message).to.equal('success');

        await harness.instance.onMessage({ from: 'script.0', command: 'readGroup', message: '99', callback: 'cb2' });
        expect(harness.sentMessages[1].message).to.deep.equal({ error: 'group 99 does not exist' });

        await harness.instance.onMessage({ from: 'script.0', command: 'unknownCmd', message: '0', callback: 'cb3' });
        expect(harness.sentMessages[2].message).to.deep.equal({ error: 'message command not supported' });
    });

    it('should validate OIDs strictly on onStateChange and deduplicate write readbacks', async () => {
        const writes: Array<{ oid: string; val: unknown }> = [];
        const harness = createAdapterHarness(
            {
                OIDs: [
                    { enabled: true, oid: '', name: 'EmptyRow', isStatus: false, group: 0 },
                    { enabled: false, oid: '/1/2/1', name: 'Disabled', isStatus: false, group: 0 },
                    { enabled: true, oid: '/1/2/1', name: 'Enabled', isStatus: false, group: 0 },
                ],
            },
            {
                writeDataPoint: (oid: string, val: string | number | boolean) => {
                    writes.push({ oid, val });
                    return Promise.resolve({ body: '<xml/>', ok: true, statusText: 'OK' });
                },
            },
        );
        harness.instance.client = harness.instance.createClient();

        // Should ignore ack: true
        await harness.instance.onStateChange('ochsner-roomterminal.0.OID./1/2/1', {
            val: 22,
            ack: true,
            from: 'system.adapter.admin.0',
        });
        expect(writes).to.have.lengthOf(0);

        // Should ignore null values
        await harness.instance.onStateChange('ochsner-roomterminal.0.OID./1/2/1', {
            val: null,
            ack: false,
            from: 'system.adapter.admin.0',
        });
        expect(writes).to.have.lengthOf(0);

        // Should ignore suffix collisions (/11/1/2/1 != /1/2/1) and empty rows
        await harness.instance.onStateChange('ochsner-roomterminal.0.OID./11/1/2/1', {
            val: 22,
            ack: false,
            from: 'system.adapter.admin.0',
        });
        expect(writes).to.have.lengthOf(0);

        // Valid write twice -> deduplicates readback timeout
        await harness.instance.onStateChange('ochsner-roomterminal.0.OID./1/2/1', {
            val: 22,
            ack: false,
            from: 'system.adapter.admin.0',
        });
        await harness.instance.onStateChange('ochsner-roomterminal.0.OID./1/2/1', {
            val: 22.5,
            ack: false,
            from: 'system.adapter.admin.0',
        });

        expect(writes).to.deep.equal([
            { oid: '/1/2/1', val: 22 },
            { oid: '/1/2/1', val: 22.5 },
        ]);
        expect(harness.states.get('ochsner-roomterminal.0.OID./1/2/1')).to.deep.equal({ val: 22.5, ack: true });
        expect(harness.activeTimers.size).to.equal(1);
        expect(harness.clearedTimers).to.have.lengthOf(1);
    });

    it('should not overwrite Status state on empty value, reject NaN, and guard length mismatch in oidRead', async () => {
        const harness = createAdapterHarness(
            {
                OIDs: [
                    { enabled: true, oid: '/1/2/1', name: 'StatusPoint', isStatus: true, group: 0 },
                    { enabled: true, oid: '/1/2/2', name: 'BadNumeric', isStatus: false, group: 0 },
                ],
            },
            {
                readDataPoints: () =>
                    Promise.resolve({
                        rawXml: '<xml/>',
                        dataPoints: [
                            {
                                name: '01:05',
                                prop: '-r-',
                                desc: 'Enum Var',
                                value: '',
                                unit: '',
                                step: '',
                                min: '',
                                max: '',
                            },
                            {
                                name: '01:06',
                                prop: '-rw',
                                desc: 'Temp',
                                value: '---',
                                unit: '°C',
                                step: 'bad',
                                min: 'bad',
                                max: '30',
                            },
                        ],
                    }),
            },
        );
        harness.instance.client = harness.instance.createClient();
        harness.instance.oidEnumsDict = { '01:05': ['Aus', 'Ein'] };

        await harness.instance.oidRead('/1/2/1;/1/2/2', [0, 1]);
        expect(harness.states.has('OID./1/2/1')).to.equal(false);
        expect(harness.states.has('Status./1/2/1')).to.equal(false);
        expect(harness.states.has('OID./1/2/2')).to.equal(false);
        expect(harness.logs.warn.some(m => m.includes('non-numeric'))).to.equal(true);

        // Length mismatch test
        await harness.instance.oidRead('/1/2/1;/1/2/2', [0]);
        expect(harness.logs.warn.some(m => m.includes('length mismatch'))).to.equal(true);
    });

    it('should recover from corrupt cache file and avoid caching empty dictionaries', async () => {
        let fetchCount = 0;
        const harness = createAdapterHarness(
            {},
            {
                fetchOidNames: (): Promise<Record<string, string>> => {
                    fetchCount++;
                    return Promise.resolve<Record<string, string>>(
                        fetchCount === 1 ? {} : { '01:02': 'Außentemperatur' },
                    );
                },
            },
        );
        harness.instance.client = harness.instance.createClient();
        harness.files.set('oidNames.json', '{invalid-json');

        // 1st call: corrupt cache -> fetches empty -> does NOT overwrite cache with {}
        const first = await harness.instance.oidGetNames();
        expect(first).to.deep.equal({});
        expect(harness.files.get('oidNames.json')).to.equal('{invalid-json');

        // 2nd call: fetches populated dict -> caches it
        const second = await harness.instance.oidGetNames();
        expect(second).to.deep.equal({ '01:02': 'Außentemperatur' });
        expect(JSON.parse(harness.files.get('oidNames.json')!)).to.deep.equal({ '01:02': 'Außentemperatur' });

        // 3rd call: served from cache without fetching
        const third = await harness.instance.oidGetNames();
        expect(third).to.deep.equal({ '01:02': 'Außentemperatur' });
        expect(fetchCount).to.equal(2);
    });

    it('should clear all managed timers, abort client, and call callback in onUnload', () => {
        let aborted = false;
        const harness = createAdapterHarness(
            {},
            {
                abort: () => {
                    aborted = true;
                },
            },
        );
        harness.instance.client = harness.instance.createClient();
        harness.instance.scheduleNextPoll(0);
        harness.instance.scheduleReconnect();
        harness.instance.scheduleWriteReadback(0);
        harness.instance.scheduleWriteReadback(1);
        expect(harness.activeTimers.size).to.equal(4);

        let unloaded = false;
        harness.instance.onUnload(() => {
            unloaded = true;
        });

        expect(unloaded).to.equal(true);
        expect(aborted).to.equal(true);
        expect(harness.activeTimers.size).to.equal(0);
        expect(harness.clearedTimers).to.have.lengthOf(4);
    });
});
