/*
 * Created with @iobroker/create-adapter v2.6.2
 */

import * as utils from '@iobroker/adapter-core';
import packageJson from '../package.json';
import { buildEnumStates, buildOidGroups, determineStateRole, extractOidIndex } from './lib/util';
import { Web2CommClient } from './lib/web2commClient';

const adapterName = packageJson.name.split('.').pop()!;
const WRITE_READBACK_DELAY_MS = 1500;

class OchsnerRoomterminal extends utils.Adapter {
    private client: Web2CommClient | undefined = undefined;
    private oidNamesDict: Record<string, string> = {};
    private oidEnumsDict: Record<string, string[]> = {};
    private oidUpdate: Record<string, string> = {};
    private oidGroups: Record<string, number[]> = {};
    private groupOidString: Record<string, string> = {};
    private pollTimeout: ioBroker.Timeout | undefined = undefined;
    private writeReadbackTimeouts: Set<ioBroker.Timeout> = new Set();
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
            for (const timeout of this.writeReadbackTimeouts) {
                this.clearTimeout(timeout);
            }
            this.writeReadbackTimeouts.clear();

            callback();
        } catch (error) {
            this.log.error(`Error during unloading: ${(error as Error).message}`);
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
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
        if (state.ack) {
            return;
        }

        const oids = this.config.OIDs ?? [];
        this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        const index = oids.findIndex(elem => id.endsWith(`OID.${elem.oid}`) || id.endsWith(elem.oid));
        if (index === -1) {
            this.log.error(`state ${id} not found in OID list`);
            return;
        }

        if (!state.from.startsWith(`system.adapter.${this.name}`)) {
            const writeSuccess = await this.oidWrite(index, state.val);
            if (writeSuccess) {
                // Confirm written state value with ack: true and schedule readback verification
                await this.setStateChangedAsync(id, { val: state.val, ack: true });
                this.scheduleWriteReadback(index);
            }
        }
    }

    /**
     * Schedules a delayed readback of a written OID using adapter-managed timeouts.
     *
     * @param index - Index of the OID in `this.config.OIDs`
     */
    private scheduleWriteReadback(index: number): void {
        const timeout = this.setTimeout(async () => {
            if (timeout) {
                this.writeReadbackTimeouts.delete(timeout);
            }
            if (this.isUnloading) {
                return;
            }
            try {
                const oid = this.config.OIDs?.[index]?.oid;
                if (oid) {
                    await this.oidRead(oid, [index]);
                }
            } catch (error) {
                this.log.error(`Readback after write failed: ${(error as Error).message}`);
            }
        }, WRITE_READBACK_DELAY_MS);

        if (timeout) {
            this.writeReadbackTimeouts.add(timeout);
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

        if (typeof obj === 'object' && obj.message) {
            if (obj.command === 'readGroup') {
                const group = String(obj.message);
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
            } else {
                resultMsg = { error: 'message command not supported' };
            }
        }

        if (obj.callback) {
            this.sendTo(obj.from, obj.command, resultMsg, obj.callback);
        }
    }

    /**
     * Initializes the adapter connection, dictionaries, and group polling.
     */
    private async main(): Promise<void> {
        // Reset the connection indicator during startup
        await this.setStateChangedAsync('info.connection', false, true);

        if (!this.config.serverIP) {
            this.log.error('Server IP address configuration must not be empty');
            return;
        }

        this.client = new Web2CommClient(this.config.serverIP, this.config.username, this.config.password);

        this.log.info(`Config username: ${this.config.username}`);
        this.log.info(`Config serverIP: ${this.config.serverIP}`);
        this.log.info(`Config pollInterval: ${this.config.pollInterval}`);

        // Check if connection to server is available with given credentials
        const connected = await this.checkForConnection();
        if (!connected) {
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

        // Start polling the OIDs when there is at least one OID group < 10
        const hasPollableGroup = Object.keys(this.oidGroups).some(groupName => Number(groupName) < 10);
        if (!hasPollableGroup) {
            this.log.info('No OIDs to poll in instance configuration');
        } else {
            void this.poll(0);
        }
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

        const keys = Object.keys(this.oidGroups);
        try {
            if (groupIndex >= keys.length) {
                // Finished full cycle through all groups
                await this.updateNativeOIDs();
                void this.poll(0);
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
     */
    private async updateNativeOIDs(): Promise<void> {
        const keys = Object.keys(this.oidUpdate);
        if (!keys.length) {
            return;
        }

        this.log.debug(`UpdateNativeOIDs: ${JSON.stringify(keys)}`);
        try {
            const instanceObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
            if (instanceObj && Array.isArray(instanceObj.native?.OIDs)) {
                for (const key of keys) {
                    const index = instanceObj.native.OIDs.findIndex((oid: ioBroker.OID) => key === oid.oid);
                    if (index !== -1) {
                        instanceObj.native.OIDs[index].name = this.oidUpdate[key] ?? key;
                    }
                }
                await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instanceObj);
                this.oidUpdate = {};
            }
        } catch (error) {
            this.log.debug(`getObject error: ${JSON.stringify(error, null, 2)}`);
        }
    }

    /**
     * Reads an OID group from the roomterminal, given by group OIDs and group config indices.
     *
     * @param oids - OID string to read, e.g. `"/1/2/3/5/8;/1/2/3/5/10"`
     * @param oidIndices - OID config indices `[5, 7]` (must correspond to `oids`)
     */
    private async oidRead(oids: string, oidIndices: number[]): Promise<void> {
        this.log.debug(`Read OIDs ${oids} (Config indices: [ ${JSON.stringify(oidIndices)} ])`);

        try {
            const { rawXml, dataPoints } = await this.client!.readDataPoints(oids);
            await this.setStateChangedAsync('info.connection', true, true);
            this.log.debug(`OID Raw Data: ${rawXml}`);

            for (let key = 0; key < dataPoints.length; key++) {
                const dp = dataPoints[key];
                const configOidIndex = oidIndices[key];
                const oidConfig = this.config.OIDs?.[configOidIndex];
                if (!oidConfig) {
                    continue;
                }

                const oid = oidConfig.oid;
                const states = buildEnumStates(dp, this.oidEnumsDict);
                const isReadable = dp.prop[1] === 'r';
                const isWritable = dp.prop[2] === 'w';
                const displayName = oidConfig.name.length ? oidConfig.name : (this.oidNamesDict[dp.name] ?? dp.name);

                this.log.debug(`Update object: ${oid} - "${dp.name}" with value: ${dp.value}`);

                const common: ioBroker.StateCommon = {
                    name: displayName,
                    type: 'number',
                    role: determineStateRole(dp.unit, isWritable, states !== undefined),
                    read: isReadable,
                    write: isWritable,
                    unit: dp.unit.length === 0 ? undefined : dp.unit,
                    min: isWritable ? (dp.min.length === 0 ? undefined : Number(dp.min)) : undefined,
                    max: isWritable ? (dp.max.length === 0 ? undefined : Number(dp.max)) : undefined,
                    step: isWritable ? (dp.step.length === 0 ? undefined : Number(dp.step)) : undefined,
                    states,
                };

                if (oidConfig.name.length === 0) {
                    this.oidUpdate[oid] = this.oidNamesDict[dp.name] ?? dp.name;
                }

                try {
                    if (dp.value.length > 0) {
                        await this.setObjectNotExistsAsync(`OID.${oid}`, {
                            type: 'state',
                            common,
                            native: {},
                        });

                        await this.setStateChangedAsync(`OID.${oid}`, { val: Number(dp.value), ack: true });
                    }

                    if (oidConfig.isStatus) {
                        const enumList = this.oidEnumsDict[dp.name];
                        if (enumList) {
                            const status = enumList[Number(dp.value)];
                            if (status) {
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
            this.log.error(`OID read or parse error: ${oids}`);
            await this.setStateChangedAsync('info.connection', false, true);
            throw new Error((error as Error).message ?? 'OID read or parse error');
        }
    }

    /**
     * Writes an OID value to the roomterminal, given by config index.
     *
     * @param index - Index of the OID entry in `this.config.OIDs`
     * @param value - Value to write to the OID
     * @returns `true` if write succeeded, `false` otherwise
     */
    private async oidWrite(index: number, value: ioBroker.StateValue): Promise<boolean> {
        const oid = this.config.OIDs[index].oid;
        const ind = extractOidIndex(oid);

        try {
            this.log.debug(`Write OID ${oid} (XML-index ${ind}) with value: ${value}`);
            const result = await this.client!.writeDataPoint(oid, value);
            this.log.debug(`write body ${oid}: ${result.body}`);
            if (!result.ok) {
                this.log.error(`writing ${oid} failed! Message: ${JSON.stringify(result.statusText)}`);
                return false;
            }
            return true;
        } catch (error) {
            this.log.error(`OID (${oid}) write error: ${(error as Error).message}`);
            await this.setStateChangedAsync('info.connection', false, true);
            return false;
        }
    }

    /**
     * Loads the OID names dictionary, either from ioBroker file storage or from the device.
     *
     * @returns OID names dictionary
     */
    private async oidGetNames(): Promise<Record<string, string>> {
        let oidNamesDict: Record<string, string> = {};
        const fileName = 'oidNames.json';
        try {
            const oidNamesExists = await this.fileExistsAsync(this.namespace, fileName);
            if (oidNamesExists) {
                this.log.debug('oidNames.json file exists - skip reading from device');
                const res = await this.readFileAsync(this.namespace, fileName);
                const content = Buffer.isBuffer(res.file) ? res.file.toString('utf-8') : String(res.file);
                oidNamesDict = JSON.parse(content) as Record<string, string>;
            } else {
                oidNamesDict = await this.client!.fetchOidNames();
                await this.writeFileAsync(this.namespace, fileName, JSON.stringify(oidNamesDict));
                this.log.debug(`${fileName} written to 'Files'`);
            }
        } catch (error) {
            this.log.error(`oidGetNames error: ${(error as Error).message}`);
        }
        return oidNamesDict;
    }

    /**
     * Loads the OID enums dictionary, either from ioBroker file storage or from the device.
     *
     * @returns OID enums dictionary
     */
    private async oidGetEnums(): Promise<Record<string, string[]>> {
        let oidEnumsDict: Record<string, string[]> = {};
        const fileName = 'oidEnums.json';
        try {
            const oidEnumsExists = await this.fileExistsAsync(this.namespace, fileName);
            if (oidEnumsExists) {
                this.log.debug('oidEnums.json file exists - skip reading from device');
                const res = await this.readFileAsync(this.namespace, fileName);
                const content = Buffer.isBuffer(res.file) ? res.file.toString('utf-8') : String(res.file);
                oidEnumsDict = JSON.parse(content) as Record<string, string[]>;
            } else {
                oidEnumsDict = await this.client!.fetchOidEnums();
                await this.writeFileAsync(this.namespace, fileName, JSON.stringify(oidEnumsDict));
                this.log.debug(`${fileName} written to 'Files'`);
            }
        } catch (error) {
            this.log.error(`oidGetEnums error: ${(error as Error).message}`);
        }
        return oidEnumsDict;
    }

    /**
     * Verifies the connection to the Ochsner Roomterminal and updates `deviceInfo` states.
     *
     * @returns `true` if connection is successful, `false` otherwise
     */
    private async checkForConnection(): Promise<boolean> {
        try {
            const data = await this.client!.fetchDeviceInfo();
            this.log.info(`DeviceInfo: ${JSON.stringify(data)}`);
            await this.setStateChangedAsync('deviceInfo.name', { val: data.device, ack: true });
            await this.setStateChangedAsync('deviceInfo.version', { val: data.version, ack: true });
        } catch {
            this.log.error('Invalid username, password or server IP-address in adapter configuration');
            return false;
        }
        return true;
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new OchsnerRoomterminal(options);
} else {
    // otherwise start the instance directly
    (() => new OchsnerRoomterminal())();
}
