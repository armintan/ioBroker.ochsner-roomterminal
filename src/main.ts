/*
 * Created with @iobroker/create-adapter v2.6.2
 */

import * as utils from '@iobroker/adapter-core';
import packageJson from '../package.json';
import { buildEnumStates, buildOidGroups, determineStateRole, extractOidIndex, parseFiniteNumber } from './lib/util';
import type { Web2CommClientOptions } from './lib/web2commClient';
import { Web2CommClient } from './lib/web2commClient';

const adapterName = packageJson.name.split('.').pop()!;
const WRITE_READBACK_DELAY_MS = 1500;
const RECONNECT_RETRY_DELAY_MS = 30_000;

class OchsnerRoomterminal extends utils.Adapter {
    private client: Web2CommClient | undefined = undefined;
    private oidNamesDict: Record<string, string> = {};
    private oidEnumsDict: Record<string, (string | null | undefined)[]> = {};
    private oidUpdate: Record<string, string> = {};
    private oidGroups: Record<string, number[]> = {};
    private groupOidString: Record<string, string> = {};
    private pollTimeout: ioBroker.Timeout | undefined = undefined;
    private reconnectTimeout: ioBroker.Timeout | undefined = undefined;
    private writeReadbackTimeouts: Map<number, ioBroker.Timeout> = new Map();
    private isUnloading = false;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: adapterName,
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Creates the `Web2CommClient` instance. Extracted as a protected method for testability.
     *
     * @param serverIP - Configured Roomterminal host/IP
     * @param username - Configured username
     * @param password - Configured password
     * @param options - Optional client overrides
     * @returns New `Web2CommClient` instance
     */
    protected createClient(
        serverIP: string,
        username: string,
        password: string,
        options?: Web2CommClientOptions,
    ): Web2CommClient {
        return new Web2CommClient(serverIP, username, password, options);
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        this.subscribeStates('OID.*');
        this.log.info(`Adapter ${this.name} is ready`);
        await this.main();
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - Callback function
     */
    private onUnload(callback: () => void): void {
        try {
            this.isUnloading = true;
            if (this.pollTimeout) {
                this.clearTimeout(this.pollTimeout);
                this.pollTimeout = undefined;
            }
            if (this.reconnectTimeout) {
                this.clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = undefined;
            }
            for (const timeout of this.writeReadbackTimeouts.values()) {
                this.clearTimeout(timeout);
            }
            this.writeReadbackTimeouts.clear();
            this.client?.abort();

            callback();
        } catch (error) {
            this.log.error(`Error during unloading: ${(error as Error).message}`);
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes.
     *
     * @param id - State ID
     * @param state - State object
     */
    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state) {
            this.log.info(`state ${id} deleted`);
            return;
        }

        // Only react to unacknowledged commands to prevent infinite loops
        if (state.ack || this.isUnloading) {
            return;
        }

        if (state.from?.startsWith(`system.adapter.${this.namespace}`)) {
            return;
        }

        if (state.val === null || state.val === undefined) {
            this.log.warn(`Ignoring null/undefined value write for state ${id}`);
            return;
        }

        if (!this.client) {
            this.log.warn(`Cannot write state ${id}: adapter is not connected yet`);
            return;
        }

        const oids = this.config.OIDs ?? [];
        this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        const index = oids.findIndex(elem => {
            const trimmedOid = typeof elem?.oid === 'string' ? elem.oid.trim() : '';
            return Boolean(elem?.enabled && trimmedOid && id === `${this.namespace}.OID.${trimmedOid}`);
        });
        if (index === -1) {
            this.log.error(`state ${id} not found in enabled OID list`);
            return;
        }

        const writeSuccess = await this.oidWrite(index, state.val);
        if (writeSuccess) {
            // Confirm written state value with ack: true and schedule readback verification
            await this.setStateChangedAsync(id, { val: state.val, ack: true });
            this.scheduleWriteReadback(index);
        }
    }

    /**
     * Schedules a delayed readback of a written OID using adapter-managed timeouts.
     * Deduplicates pending readbacks for the same OID index.
     *
     * @param index - Index of the OID in `this.config.OIDs`
     */
    private scheduleWriteReadback(index: number): void {
        if (this.isUnloading) {
            return;
        }

        const existingTimeout = this.writeReadbackTimeouts.get(index);
        if (existingTimeout) {
            this.clearTimeout(existingTimeout);
            this.writeReadbackTimeouts.delete(index);
        }

        const timeout = this.setTimeout(async () => {
            this.writeReadbackTimeouts.delete(index);
            if (this.isUnloading || !this.client) {
                return;
            }
            try {
                const oid = this.config.OIDs?.[index]?.oid?.trim();
                if (oid) {
                    await this.oidRead(oid, [index]);
                }
            } catch (error) {
                this.log.error(`Readback after write failed: ${(error as Error).message}`);
            }
        }, WRITE_READBACK_DELAY_MS);

        if (timeout) {
            this.writeReadbackTimeouts.set(index, timeout);
        }
    }

    /**
     * Handles messages sent to this adapter instance over the message box.
     *
     * @param obj - ioBroker message object
     */
    private async onMessage(obj: ioBroker.Message): Promise<void> {
        this.log.debug(`message received ${JSON.stringify(obj, null, 2)}`);
        let resultMsg: string | { error: string } = { error: 'internal error' };

        if (obj && typeof obj === 'object') {
            if (obj.command === 'readGroup') {
                if (obj.message === undefined || obj.message === null || obj.message === '') {
                    resultMsg = { error: 'group must not be empty' };
                } else if (!this.client) {
                    resultMsg = { error: 'adapter is not connected' };
                } else {
                    const group = String(obj.message).trim();
                    const groupExists = Object.prototype.hasOwnProperty.call(this.oidGroups, group);
                    this.log.debug(`read group ${group} (exists: ${groupExists})`);

                    if (groupExists) {
                        try {
                            await this.oidRead(this.groupOidString[group], this.oidGroups[group]);
                            resultMsg = 'success';
                        } catch (error: unknown) {
                            resultMsg = { error: (error as Error).message ?? 'unknown error' };
                        }
                    } else {
                        this.log.info(`group "${group}" does not exist`);
                        resultMsg = { error: `group ${group} does not exist` };
                    }
                }
            } else {
                resultMsg = { error: 'message command not supported' };
            }
        }

        if (obj?.callback) {
            this.sendTo(obj.from, obj.command, resultMsg, obj.callback);
        }
    }

    /**
     * Initializes the adapter connection, dictionaries, and group polling.
     */
    private async main(): Promise<void> {
        // Reset the connection indicator during startup
        await this.setStateChangedAsync('info.connection', false, true);

        const serverIP = this.config.serverIP?.trim();
        if (!serverIP) {
            this.log.error('Server IP address configuration must not be empty');
            return;
        }

        this.client = this.createClient(serverIP, this.config.username ?? '', this.config.password ?? '');

        this.log.info(`Config username: ${this.config.username}`);
        this.log.info(`Config serverIP: ${serverIP}`);
        this.log.info(`Config pollInterval: ${this.config.pollInterval}`);

        await this.connectAndStart();
    }

    /**
     * Checks connectivity to the Roomterminal, initializes dictionaries/groups, and starts polling.
     * Schedules a reconnect retry if the device is currently unreachable.
     */
    private async connectAndStart(): Promise<void> {
        if (this.isUnloading) {
            return;
        }

        const connected = await this.checkForConnection();
        if (!connected) {
            this.scheduleReconnect();
            return;
        }
        await this.setStateChangedAsync('info.connection', true, true);

        // Prepare group handling
        if (this.config.OIDs?.length) {
            const { oidGroups, groupOidString } = buildOidGroups(this.config.OIDs);
            this.oidGroups = oidGroups;
            this.groupOidString = groupOidString;

            this.log.debug(`Groups: ${JSON.stringify(this.oidGroups)}`);
            this.log.debug(`Group OIDs: ${JSON.stringify(this.groupOidString)}`);

            // Load the oidNames and oidEnums dictionaries
            this.oidNamesDict = await this.oidGetNames();
            this.oidEnumsDict = await this.oidGetEnums();
        }

        if (this.isUnloading) {
            return;
        }

        // Start polling the OIDs when there is at least one OID group < 10
        const hasPollableGroup = Object.keys(this.oidGroups).some(groupName => Number(groupName) < 10);
        if (!hasPollableGroup) {
            this.log.info('No OIDs to poll in instance configuration');
        } else {
            void this.poll(0);
        }
    }

    /**
     * Schedules a startup reconnect attempt if the device is temporarily unreachable.
     */
    private scheduleReconnect(): void {
        if (this.isUnloading) {
            return;
        }
        if (this.reconnectTimeout) {
            this.clearTimeout(this.reconnectTimeout);
        }
        const retryMs = Math.max(RECONNECT_RETRY_DELAY_MS, (Number(this.config.pollInterval) || 30) * 1000);
        this.log.info(`Retrying connection in ${Math.round(retryMs / 1000)}s`);
        this.reconnectTimeout = this.setTimeout(() => {
            this.reconnectTimeout = undefined;
            void this.connectAndStart();
        }, retryMs);
    }

    /**
     * Schedules the next poll execution after the configured pollInterval.
     *
     * @param nextGroupIndex - Next group index to poll
     */
    private scheduleNextPoll(nextGroupIndex: number): void {
        if (this.isUnloading) {
            return;
        }
        if (this.pollTimeout) {
            this.clearTimeout(this.pollTimeout);
        }
        const intervalMs = Math.max(1, Number(this.config.pollInterval) || 30) * 1000;
        this.pollTimeout = this.setTimeout(() => {
            this.pollTimeout = undefined;
            void this.poll(nextGroupIndex);
        }, intervalMs);
    }

    /**
     * Main polling routine - fetching next Group in list.
     *
     * @param groupIndex - Index of the group to poll (default: 0)
     */
    private async poll(groupIndex = 0): Promise<void> {
        if (this.isUnloading) {
            return;
        }

        const keys = Object.keys(this.oidGroups).sort((a, b) => Number(a) - Number(b));
        try {
            if (groupIndex >= keys.length) {
                // Finished full cycle through all groups
                const updated = await this.updateNativeOIDs();
                if (!updated && !this.isUnloading) {
                    void this.poll(0);
                }
            } else if (Number(keys[groupIndex]) > 9) {
                // Group numbers >= 10 are reserved for on-demand readGroup messages
                this.log.debug(
                    `skip group ${keys[groupIndex]}, groups with numbers > 9 are reserved for readGroup messages, only!!`,
                );
                void this.poll(groupIndex + 1);
            } else {
                const groupKey = keys[groupIndex];
                this.log.debug(`Read Group ${groupKey}`);
                await this.oidRead(this.groupOidString[groupKey], this.oidGroups[groupKey]);
                this.scheduleNextPoll(groupIndex + 1);
            }
        } catch (error) {
            this.log.error(`Error during poll: ${(error as Error).message}`);
            this.scheduleNextPoll(0);
        }
    }

    /**
     * Checks for empty OID names in config, populates default names from the device dictionary,
     * and updates `native.OIDs` in the instance object (which restarts the adapter).
     *
     * @returns `true` if the instance object was updated, `false` otherwise
     */
    private async updateNativeOIDs(): Promise<boolean> {
        const keys = Object.keys(this.oidUpdate);
        if (!keys.length) {
            return false;
        }

        this.log.debug(`UpdateNativeOIDs: ${JSON.stringify(keys)}`);
        try {
            const instanceObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
            if (instanceObj && Array.isArray(instanceObj.native?.OIDs)) {
                let changed = false;
                for (const key of keys) {
                    const index = instanceObj.native.OIDs.findIndex((oid: ioBroker.OID) => key === oid.oid?.trim());
                    const nextName = (this.oidUpdate[key] || key).trim();
                    if (index !== -1 && nextName.length > 0 && instanceObj.native.OIDs[index].name !== nextName) {
                        instanceObj.native.OIDs[index].name = nextName;
                        changed = true;
                    }
                }
                this.oidUpdate = {};
                if (changed) {
                    await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instanceObj);
                    return true;
                }
            }
        } catch (error) {
            this.log.debug(`getObject error: ${JSON.stringify(error, null, 2)}`);
        }
        return false;
    }

    /**
     * Reads an OID group from the roomterminal, given by group OIDs and group config indices.
     *
     * @param oids - OID string to read, e.g. `"/1/2/3/5/8;/1/2/3/5/10"`
     * @param oidIndices - OID config indices `[5, 7]` (must correspond to `oids`)
     */
    private async oidRead(oids: string, oidIndices: number[]): Promise<void> {
        if (!this.client) {
            throw new Error('Web2CommClient is not initialized');
        }
        this.log.debug(`Read OIDs ${oids} (Config indices: [ ${JSON.stringify(oidIndices)} ])`);

        try {
            const { rawXml, dataPoints } = await this.client.readDataPoints(oids);
            await this.setStateChangedAsync('info.connection', true, true);
            this.log.debug(`OID Raw Data: ${rawXml}`);

            if (dataPoints.length !== oidIndices.length) {
                this.log.warn(
                    `OID response length mismatch for "${oids}": expected ${oidIndices.length} data point(s), got ${dataPoints.length}. Skipping state update to prevent misalignment.`,
                );
                return;
            }

            for (let key = 0; key < dataPoints.length; key++) {
                const dp = dataPoints[key];
                const configOidIndex = oidIndices[key];
                const oidConfig = this.config.OIDs?.[configOidIndex];
                if (!oidConfig) {
                    continue;
                }

                const oid = oidConfig.oid.trim();
                const states = buildEnumStates(dp, this.oidEnumsDict);
                const isReadable = dp.prop[1] === 'r';
                const isWritable = dp.prop[2] === 'w';
                const configuredName = (oidConfig.name ?? '').trim();
                const deviceName = (this.oidNamesDict[dp.name] ?? dp.name).trim();
                const displayName = configuredName.length > 0 ? configuredName : deviceName || oid;

                this.log.debug(`Update object: ${oid} - "${dp.name}" with value: ${dp.value}`);

                const common: ioBroker.StateCommon = {
                    name: displayName,
                    type: 'number',
                    role: determineStateRole(dp.unit, isWritable),
                    read: isReadable,
                    write: isWritable,
                };
                if (dp.unit.trim().length > 0) {
                    common.unit = dp.unit.trim();
                }
                if (isWritable) {
                    const minVal = parseFiniteNumber(dp.min);
                    const maxVal = parseFiniteNumber(dp.max);
                    const stepVal = parseFiniteNumber(dp.step);
                    if (minVal !== undefined) {
                        common.min = minVal;
                    }
                    if (maxVal !== undefined) {
                        common.max = maxVal;
                    }
                    if (stepVal !== undefined) {
                        common.step = stepVal;
                    }
                }
                if (states !== undefined) {
                    common.states = states;
                }

                if (configuredName.length === 0 && deviceName.length > 0) {
                    this.oidUpdate[oid] = deviceName;
                }

                const numericValue = parseFiniteNumber(dp.value);
                if (dp.value.trim().length > 0 && numericValue === undefined) {
                    this.log.warn(`Ignoring non-numeric value "${dp.value}" for OID ${oid} (${dp.name})`);
                    continue;
                }

                if (numericValue === undefined) {
                    continue;
                }

                try {
                    await this.setObjectNotExistsAsync(`OID.${oid}`, {
                        type: 'state',
                        common,
                        native: {},
                    });

                    await this.setStateChangedAsync(`OID.${oid}`, { val: numericValue, ack: true });

                    if (oidConfig.isStatus) {
                        const enumList = this.oidEnumsDict[dp.name];
                        if (Array.isArray(enumList)) {
                            const status = enumList[numericValue];
                            if (typeof status === 'string' && status.length > 0) {
                                await this.setObjectNotExistsAsync(`Status.${oid}`, {
                                    type: 'state',
                                    common: {
                                        name: `Status.${displayName}`,
                                        type: 'string',
                                        role: 'text',
                                        read: true,
                                        write: false,
                                    },
                                    native: {},
                                });
                                await this.setStateChangedAsync(`Status.${oid}`, { val: status, ack: true });
                                this.log.debug(`Update status object: ${oid} with value: ${status}`);
                            }
                        } else {
                            this.log.info(`No status text found for ${oid} (${dp.name})`);
                            this.log.info(`Please check isStatus configuration for ${oid}`);
                        }
                    }
                } catch (error: unknown) {
                    this.log.error(`Error message: ${(error as Error)?.message}`);
                    this.log.error(`State update for ${oids} failed`);
                }
            }
        } catch (error: unknown) {
            this.log.error(`OID read or parse error for "${oids}": ${(error as Error).message}`);
            await this.setStateChangedAsync('info.connection', false, true);
            throw error instanceof Error ? error : new Error('OID read or parse error');
        }
    }

    /**
     * Writes an OID value to the roomterminal, given by config index.
     *
     * @param index - Index of the OID entry in `this.config.OIDs`
     * @param value - Value to write to the OID
     * @returns `true` if write succeeded, `false` otherwise
     */
    private async oidWrite(index: number, value: string | number | boolean): Promise<boolean> {
        if (!this.client) {
            return false;
        }
        const oid = this.config.OIDs[index].oid.trim();
        const ind = extractOidIndex(oid);

        try {
            this.log.debug(`Write OID ${oid} (XML-index ${ind}) with value: ${value}`);
            const result = await this.client.writeDataPoint(oid, value);
            this.log.debug(`write body ${oid}: ${result.body}`);
            if (!result.ok) {
                this.log.error(`writing ${oid} failed! Message: ${JSON.stringify(result.statusText)}`);
                return false;
            }
            await this.setStateChangedAsync('info.connection', true, true);
            return true;
        } catch (error) {
            this.log.error(`OID (${oid}) write error: ${(error as Error).message}`);
            await this.setStateChangedAsync('info.connection', false, true);
            return false;
        }
    }

    /**
     * Loads a cached JSON dictionary from ioBroker file storage, or fetches it from the device and caches it.
     * Falls back to fetching from the device if the cached file is unreadable or corrupt,
     * and avoids caching empty dictionaries.
     *
     * @param fileName - Cache file name in adapter file storage
     * @param fetcher - Async function to fetch the dictionary from the device
     * @returns Loaded or fetched dictionary
     */
    private async loadOrFetchCachedJson<T extends Record<string, unknown>>(
        fileName: string,
        fetcher: () => Promise<T>,
    ): Promise<T> {
        try {
            const exists = await this.fileExistsAsync(this.namespace, fileName);
            if (exists) {
                this.log.debug(`${fileName} file exists - loading from cache`);
                const res = await this.readFileAsync(this.namespace, fileName);
                const content = Buffer.isBuffer(res.file) ? res.file.toString('utf-8') : String(res.file);
                const parsed = JSON.parse(content) as T;
                if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                    return parsed;
                }
                this.log.warn(`${fileName} cache is empty or invalid - refreshing from device`);
            }
        } catch (error) {
            this.log.warn(`Failed to read cached ${fileName} (${(error as Error).message}) - refreshing from device`);
        }

        try {
            const fetched = await fetcher();
            if (Object.keys(fetched).length > 0) {
                await this.writeFileAsync(this.namespace, fileName, JSON.stringify(fetched));
                this.log.debug(`${fileName} written to 'Files'`);
            }
            return fetched;
        } catch (error) {
            this.log.error(`Failed to load ${fileName}: ${(error as Error).message}`);
            return {} as T;
        }
    }

    /**
     * Loads the OID names dictionary, either from ioBroker file storage or from the device.
     *
     * @returns OID names dictionary
     */
    private async oidGetNames(): Promise<Record<string, string>> {
        if (!this.client) {
            return {};
        }
        return this.loadOrFetchCachedJson('oidNames.json', () => this.client!.fetchOidNames());
    }

    /**
     * Loads the OID enums dictionary, either from ioBroker file storage or from the device.
     *
     * @returns OID enums dictionary
     */
    private async oidGetEnums(): Promise<Record<string, (string | null | undefined)[]>> {
        if (!this.client) {
            return {};
        }
        return this.loadOrFetchCachedJson('oidEnums.json', () => this.client!.fetchOidEnums());
    }

    /**
     * Verifies the connection to the Ochsner Roomterminal and updates `deviceInfo` states.
     *
     * @returns `true` if connection is successful, `false` otherwise
     */
    private async checkForConnection(): Promise<boolean> {
        if (!this.client) {
            return false;
        }
        try {
            const data = await this.client.fetchDeviceInfo();
            this.log.info(`DeviceInfo: ${JSON.stringify(data)}`);
            if (typeof data?.device === 'string') {
                await this.setStateChangedAsync('deviceInfo.name', { val: data.device, ack: true });
            }
            if (typeof data?.version === 'string') {
                await this.setStateChangedAsync('deviceInfo.version', { val: data.version, ack: true });
            }
            return true;
        } catch (error) {
            this.log.error(
                `Failed to connect to ${this.config.serverIP}: ${(error as Error).message} (check username, password, and server IP-address)`,
            );
            return false;
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    const createAdapter = (options: Partial<utils.AdapterOptions> | undefined): OchsnerRoomterminal =>
        new OchsnerRoomterminal(options);
    module.exports = Object.assign(createAdapter, { OchsnerRoomterminal });
} else {
    // otherwise start the instance directly
    (() => new OchsnerRoomterminal())();
}
