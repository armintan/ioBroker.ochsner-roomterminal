/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';

// Load your modules here, e.g.:
import DigestFetch from 'digest-fetch';
import { parseStringPromise } from 'xml2js';
import packageJson from '../package.json';
import { getEnumKeys } from './lib/util';

// import * as fs from "fs";
const adapterName = packageJson.name.split('.').pop();
const getOptions = {
	method: 'get',
	headers: {
		Connection: 'Keep-Alive',
		Accept: 'text/xml',
		Pragma: 'no-cache',
		'Cache-Control': 'no-cache',
		'Content-Type': 'text/xml; charset=utf-8',
	},
};
// /home/parallels/ioBroker.ochsner-roomterminal/node_modules/@types/iobroker/index.d.ts
class OchsnerRoomterminal extends utils.Adapter {
	private deviceInfoUrl = '';
	private getUrl = '';
	private client: any | undefined = undefined;
	private oidNamesDict: { [id: string]: string } | undefined = undefined;
	private oidEnumsDict: { [id: string]: string[] } | undefined = undefined;
	private oidUpdate: { [id: string]: string } = {};
	private groups: Record<string, number[]> = {};
	private groupOidString: Record<string, string> = {};

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: adapterName!,
		});
		// this.log.info(`Adapter Name: ${this.name}`);
		// this.log.info(`Adapter Instance: ${this.instance}`);
		// this.log.info(`Adapter Namespace: ${this.namespace}`);
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		// Initialize your adapter here
		this.subscribeStates('OID.*');
		this.log.info(`Adapter Name: ${this.name} is ready !!!!!!`);
		this.main();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		callback();
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  */
	// private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else { 17058
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 */
	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		const oids = this.config.OIDs;
		if (state) {
			// The state was changed
			if (!state.ack) {
				// only write to device value if state is not acknowledged
				this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
				const index = oids.findIndex((elem) => id.endsWith(elem.oid));
				if (index == -1) {
					this.log.error(`state ${id} not found in OID list`);
					return;
				}
				// this.log.debug(`adapter name: ${this.name}, namespace: ${this.namespace}`);
				this.log.debug(`From: system.adapter.${this.name}`);
				// we are only interested in state changes, which are not from reading our OIDs
				if (!state.from.startsWith(`system.adapter.${this.name}`)) {
					await this.oidWrite(index, state.val);
					await this.delay(1000);
					await this.oidRead(index);
				}
			}
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  */
	private async onMessage(obj: ioBroker.Message): Promise<void> {
		this.log.debug('message received' + JSON.stringify(obj, null, 2));
		let resultMsg: any = { error: 'internal error' };
		// let resultMsg = { error: false, result: 'success' };
		if (typeof obj === 'object' && obj.message) {
			if (obj.command === 'readGroup') {
				// read group with string 'obj.command'
				const groupIndex = Object.keys(this.groups).indexOf(String(obj.message));
				this.log.debug(`read group ${obj.message} (groupIndex: ${groupIndex})`);

				if (groupIndex !== -1) {
					try {
						await this.oidReadGroup(String(obj.message));
						resultMsg = 'success';
					} catch (error: any) {
						resultMsg = { error: error.message ?? 'unknown error' };
					}
				} else {
					this.log.info(`group "${obj.message}" does not exist`);
					resultMsg = { error: `group ${obj.message} does not exist` };
				}
			} else resultMsg = { error: 'message command not supported' };
		}
		// Send response in callback if required
		// if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
		if (obj.callback) {
			this.sendTo(obj.from, obj.command, resultMsg, obj.callback);
		}
	}

	/**
	 * Private functions
	 */

	/**
	 * ----------------------------
	 *  Inititialize the adapter
	 * ----------------------------
	 */
	private async main(): Promise<void> {
		// Reset the connection indicator during startup
		this.setState('info.connection', false, true);

		// Initialize private instance variables
		this.deviceInfoUrl = `http://${this.config.serverIP}/api/1.0/info/deviceinfo`;
		this.getUrl = `http://${this.config.serverIP}/ws`;
		this.client = new DigestFetch(this.config.username, this.config.password);

		// Attention !!!
		// this.log.info(`Config: ${JSON.stringify(this.config, null, 2)}`);

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		if (!this.config.serverIP) {
			this.log.error('Server IP address configuration must not be emtpy');
			return;
		}

		this.log.info('config username: ' + this.config.username);
		// this.log.info('config password: ' + this.config.password);
		this.log.info('config serverIP: ' + this.config.serverIP);
		this.log.info('config pollInterval: ' + this.config.pollInterval);

		// check if connection to server is available with given credentials
		const connected = await this.checkForConnection();
		if (!connected) {
			return;
		}
		this.setState('info.connection', true, true);

		/**
		 * Prepare Group Handling
		 * this.groups = {"group01": [OIDsIndex01, OIDsIndex02, ....],"group02": [OIDsIndex01, OIDsIndex02, ....], .... }
		 * this.groupOIDString = {"group01": "oid1;oid3", "group02": "oid2;oid4"}
		 */
		if (this.config.OIDs?.length) {
			this.config.OIDs.forEach((value, key) => {
				const group = this.config.OIDs[key].group;
				const enabled = this.config.OIDs[key].enabled;
				const oid = this.config.OIDs[key].oid;
				// this.log.debug(`Key: ${key} Object: ${JSON.stringify(this.config.OIDs[key])}`);
				if (enabled) {
					if (this.groups[group] == undefined) this.groups[group] = [key];
					else this.groups[group].push(key);
					if (this.groupOidString[group] == undefined) this.groupOidString[group] = oid;
					else this.groupOidString[group] = this.groupOidString[group] + ';' + oid;
				}
			});
			this.log.debug(`Groups: ${JSON.stringify(this.groups)}`);
			this.log.debug(`Group OIDs: ${JSON.stringify(this.groupOidString)}`);

			// load the oidNames and oiEnums dictionary
			// TODO: read both dictionary also, when device version changed
			this.oidNamesDict = await this.oidGetNames();
			this.oidEnumsDict = await this.oidGetEnums();
		}

		// Start polling the OID's when there is at least one OID group <= 10
		if (Object.keys(this.groups).findIndex((groupName) => +groupName < 10) == -1)
			this.log.debug('No OIDs to poll in instance configuration');
		else this.poll();
	}

	/**
	 * Main polling routine - fetching next Group in list
	 *
	 * @description Started once during startup, restarts itself when finished
	 * 				(only called when there is at least one oid)
	 */
	private async poll(groupIndex = 0): Promise<void> {
		const keys = Object.keys(this.groups);
		// this.log.debug(`poll with groupIndex: ${groupIndex}; keys length: ${keys.length}`);

		// TODO: avoid delay when OID is disabled
		try {
			// read the next OID group from roomterminal
			if (groupIndex >= keys.length) {
				// we read the last group
				await this.updateNativeOIDs(Object.keys(this.oidUpdate));
				this.poll(0); // start from the beginning, without delay
			} else if (+keys[groupIndex] > 9) {
				// groupNames from 10 onwards are reserved for messages
				this.log.debug(`skip group ${keys[groupIndex]}, this number is reserved for messages!!`);
				this.poll(++groupIndex);
			} else {
				await this.oidReadGroup(keys[groupIndex]);
				await this.delay(this.config.pollInterval * 1000);
				this.poll(++groupIndex);
			}
		} catch (error) {
			this.log.error(`Error: ${JSON.stringify(error)}`);
			await this.delay(this.config.pollInterval * 1000);
			this.poll(0);
		}
	}

	/**
	 * Check for empty OID names in config and add default names
	 * and update common.native.OIDs in instance object (which restarts the adapter)
	 * @param keys to update
	 */
	private async updateNativeOIDs(keys: string[]): Promise<void> {
		this.log.debug(`UpdateNativeOIDs: ${JSON.stringify(keys)}`);
		if (!keys.length) return; // there is nothing to update
		try {
			const instanceObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
			if (instanceObj) {
				// this.log.debug(`Old native objects: ${JSON.stringify(instanceObj.native, null, 2)}`);
				keys.forEach((key) => {
					const index = instanceObj.native.OIDs.findIndex((oid: ioBroker.OID) => key === oid.oid);
					if (index !== -1) instanceObj.native.OIDs[index].name = this.oidUpdate[key] ?? key;
				});
				// this.log.debug(`New native objects: ${JSON.stringify(instanceObj.native, null, 2)}`);
				await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instanceObj);
				this.oidUpdate = {};
				// this.log.debug(`Instance object id: ${JSON.stringify(res, null, 2)}`);
			}
		} catch (error) {
			this.log.debug(`getObject error: ${JSON.stringify(error, null, 2)}`);
		}
	}

	/**
	 * Read OID group from roomterminal, given by group name
	 *
	 * @param groupKey Name of the OID group to read
	 */
	private async oidReadGroup(groupKey: string): Promise<void> {
		this.log.debug(`Read Group ${groupKey}`);
		const oids = this.groupOidString[groupKey];
		const group = this.groups[groupKey];

		this.log.debug(`OID Config Indices: [ ${JSON.stringify(group)} ]`);
		this.log.debug(`Read [ ${oids} ]`);

		// TODO: wrong UID error handling

		const body = `<?xml version="1.0" encoding="UTF-8"?>
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

		const options = {
			method: 'post',
			body: body,
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
		try {
			const response = await this.client.fetch(this.getUrl, options);
			if (response.ok == true) {
				// Reading was succcesfull
				this.setState('info.connection', true, true);

				const data = await response.text();
				this.log.debug(`OID Raw Data: ${data}`);
				const jsonResult = await parseStringPromise(data);
				const dpCfg: any[] = jsonResult['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['ns:getDpResponse'][0].dpCfg;
				// this.log.debug(`DP JSON Length: ${dpCfg.length} / oid array length: ${oidArray.length}`);
				// this.log.debug(`Data: ${JSON.stringify(dpCfg)}`);

				// loop through dpCfg[]
				dpCfg.forEach(async (dp, key) => {
					const configOidIndex = group[key];
					const oid = this.config.OIDs[configOidIndex].oid;
					const states: { [key: string]: string } = {};

					// this.log.debug(`[Key: ${key}][config OID index: ${configOidIndex}] DP: ${JSON.stringify(dp)}`);

					const name: string = dp.name[0];
					const prop: string = dp.prop[0];
					const desc: string = dp.desc[0];
					const value: string = dp.value[0];
					const unit: string = dp.unit[0];
					const step: string = dp.step[0];
					const min: string = dp.minValue[0];
					const max: string = dp.maxValue[0];

					// this.log.debug(`desc: ${desc}, prop: ${prop}`);

					if (this.oidEnumsDict![name]) {
						// this.log.debug(`Enums ${JSON.stringify(this.oidEnumsDict![name])}`);
						if (desc === 'Enum Var') {
							const enums = getEnumKeys(prop);
							if (enums) {
								enums.forEach(
									(val) => (states[val] = this.oidEnumsDict![name][Number(val)] ?? 'undefined'),
								);
							}
						} else {
							this.oidEnumsDict![name].forEach((val, key) => (states[key] = val ?? 'undefined'));
						}
					}
					// else this.log.debug('No enums for ' + name);

					// this.log.debug(`OID states: ${JSON.stringify(states)}`);
					// this.log.debug(`configOidIndex: ${configOidIndex}`);
					// this.log.debug(`name: ${this.config.OIDs[configOidIndex].name}`);
					// this.log.debug(`prop: ${prop}`);
					// this.log.debug(`unit: ${unit}`);
					this.log.debug(`update oid: ${oid} - "${name}"`);

					const common: ioBroker.StateCommon = {
						name: this.config.OIDs[configOidIndex].name.length
							? this.config.OIDs[configOidIndex].name
							: this.oidNamesDict![name],
						type: 'number',
						role: 'value',
						read: prop[1] === 'r' ? true : false,
						write: prop[2] === 'w' ? true : false,
						unit: unit.length === 0 ? undefined : unit,
						min: prop[2] === 'w' ? (min.length === 0 ? undefined : Number(min)) : undefined,
						max: prop[2] === 'w' ? (max.length === 0 ? undefined : Number(max)) : undefined,
						step: prop[2] === 'w' ? (step.length === 0 ? undefined : Number(step)) : undefined,
						//TODO: add states based on XML
						states: Object.keys(states).length == 0 ? undefined : states,
						// 	// states: { '0': 'OFF', '1': 'ON', '-3': 'whatever' },
					};
					// this.log.debug(`common: ${JSON.stringify(common)}`);

					if (this.config.OIDs[configOidIndex].name.length === 0)
						this.oidUpdate[oid] = this.oidNamesDict![name] ?? name;
					try {
						if (value.length > 0) {
							await this.setObjectNotExistsAsync('OID.' + oid, {
								type: 'state',
								common,
								native: {},
							});

							this.setState('OID.' + oid, { val: Number(value), ack: true });
						}
						if (this.config.OIDs[configOidIndex].isStatus) {
							const status = this.oidEnumsDict![name][Number(value)];
							if (status) {
								await this.setObjectNotExistsAsync('Status.' + oid, {
									type: 'state',
									common: {
										name: 'Status.' + this.config.OIDs[configOidIndex].name,
										type: 'string',
										role: 'value',
										read: true,
										write: false,
									},
									native: {},
								});
								this.setState('Status.' + oid, { val: status, ack: true });
								this.log.debug(`Status object updated for ${oid}`);
							}
						}
					} catch (error: any) {
						this.log.error('Error message: ' + error?.message);
						this.log.error(`State update for ${oids} failes`);
					}
				});
			} else {
				this.log.error(`reading ${oids} failed! Message: ${JSON.stringify(response.statusText)}`);
				throw new Error(`reading ${oids} failed! Message: ${JSON.stringify(response.statusText)}`);
			}
		} catch (_error: any) {
			this.log.error('OID read or parse error: ' + oids);
			this.setState('info.connection', false, true);
			throw new Error(_error.message ?? 'OID read or parse error');
		}
	}

	/**
	 * Read OID group from roomterminal, given by index
	 *
	 * @param index index of the OID group to tread in this.config.OiDs
	 */
	private async oidRead(index: number): Promise<void> {
		const oid = this.config.OIDs[index].oid;

		// TODO: wrong UID error handling

		this.log.debug(`read oid: ${oid}`);
		const body = `<?xml version="1.0" encoding="UTF-8"?>
			<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" 
			xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" 
			xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
			xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
			xmlns:ns="http://ws01.lom.ch/soap/">
			 <SOAP-ENV:Body>
			   <ns:getDpRequest>
				<ref>
				 <oid>${oid}</oid>
				 <prop/>
				</ref>
				<startIndex>0</startIndex>
				<count>-1</count>
			   </ns:getDpRequest>
			 </SOAP-ENV:Body>
			</SOAP-ENV:Envelope>`;
		this.log.debug(`Fetch body: ${JSON.stringify(body, null, 2)}`);
		const options = {
			method: 'post',
			body: body,
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
		try {
			const response = await this.client.fetch(this.getUrl, options);
			this.log.debug(`Fetch response: ${JSON.stringify(response, null, 2)}`);
			if (response.ok == true) {
				// Reading was succcesfull
				this.setState('info.connection', true, true);

				const data = await response.text();
				this.log.debug(`OID Raw Data: ${data}`);
				const jsonResult = await parseStringPromise(data);
				const dpCfg: any[] = jsonResult['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['ns:getDpResponse'][0].dpCfg;
				// this.log.debug(`DP JSON Length: ${dpCfg.length} / oid array length: ${oidArray.length}`);
				this.log.debug(`Data: ${JSON.stringify(dpCfg)}`);

				// loop through dpCfg[]
				dpCfg.forEach(async (dp) => {
					const states: { [key: string]: string } = {};

					// this.log.debug(`[Key: ${key}][config OID index: ${configOidIndex}] DP: ${JSON.stringify(dp)}`);

					const name: string = dp.name[0];
					const prop: string = dp.prop[0];
					const desc: string = dp.desc[0];
					const value: string = dp.value[0];
					const unit: string = dp.unit[0];
					const step: string = dp.step[0];
					const min: string = dp.minValue[0];
					const max: string = dp.maxValue[0];

					// this.log.debug(`desc: ${desc}, prop: ${prop}`);

					if (this.oidEnumsDict![name]) {
						// this.log.debug(`Enums ${JSON.stringify(this.oidEnumsDict![name])}`);
						if (desc === 'Enum Var') {
							const enums = getEnumKeys(prop);
							if (enums) {
								enums.forEach(
									(val) => (states[val] = this.oidEnumsDict![name][Number(val)] ?? 'undefined'),
								);
							}
						} else {
							this.oidEnumsDict![name].forEach((val, key) => (states[key] = val ?? 'undefined'));
						}
					}
					// else this.log.debug('No enums for ' + name);

					// this.log.debug(`OID states: ${JSON.stringify(states)}`);
					// this.log.debug(`configOidIndex: ${configOidIndex}`);
					// this.log.debug(`name: ${this.config.OIDs[configOidIndex].name}`);
					// this.log.debug(`prop: ${prop}`);
					// this.log.debug(`unit: ${unit}`);
					this.log.debug(`update oid: ${oid} - "${name}"`);

					const common: ioBroker.StateCommon = {
						name: this.config.OIDs[index].name.length
							? this.config.OIDs[index].name
							: this.oidNamesDict![name],
						type: 'number',
						role: 'value',
						read: prop[1] === 'r' ? true : false,
						write: prop[2] === 'w' ? true : false,
						unit: unit.length === 0 ? undefined : unit,
						min: prop[2] === 'w' ? (min.length === 0 ? undefined : Number(min)) : undefined,
						max: prop[2] === 'w' ? (max.length === 0 ? undefined : Number(max)) : undefined,
						step: prop[2] === 'w' ? (step.length === 0 ? undefined : Number(step)) : undefined,
						//TODO: add states based on XML
						states: Object.keys(states).length == 0 ? undefined : states,
						// 	// states: { '0': 'OFF', '1': 'ON', '-3': 'whatever' },
					};
					// this.log.debug(`common: ${JSON.stringify(common)}`);

					try {
						if (value.length > 0) {
							await this.setObjectNotExistsAsync('OID.' + oid, {
								type: 'state',
								common,
								native: {},
							});

							this.setState('OID.' + oid, { val: Number(value), ack: true });
						}
						if (this.config.OIDs[index].isStatus) {
							const status = this.oidEnumsDict![name][Number(value)];
							if (status) {
								await this.setObjectNotExistsAsync('Status.' + oid, {
									type: 'state',
									common: {
										name: 'Status.' + this.config.OIDs[index].name,
										type: 'string',
										role: 'value',
										read: true,
										write: false,
									},
									native: {},
								});
								this.setState('Status.' + oid, { val: status, ack: true });
								this.log.debug(`Status object updated for ${oid}`);
							}
						}
					} catch (error: any) {
						this.log.error('Error message: ' + error?.message);
						this.log.error(`State update for ${oid} failes`);
					}
				});
			} else {
				this.log.error(
					`reading ${JSON.stringify(oid, null, 2)} failed! Message: ${JSON.stringify(response.statusText)}`,
				);
			}
		} catch (_error) {
			this.log.error('OID read or parse error: ' + oid);
			this.setState('info.connection', false, true);
		}
	}

	/**
	 * Write OID to roomterminal, given by index
	 *
	 * @param index index of the OID etnry to tread in this.config.OiDs
	 */
	private async oidWrite(index: number, value: any): Promise<void> {
		// this.log.debug(JSON.stringify(oids, null, 2));
		// this.log.debug(JSON.stringify(status, null, 2));
		const oid = this.config.OIDs[index].oid;
		this.log.debug(`write oid: ${oid}`);
		// TODO: wrong UID error handling
		const body = `<?xml version="1.0" encoding="UTF-8"?>
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
			<index>0</index>
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
		this.log.debug(`write body ${oid}: ${body}`);

		const options = {
			method: 'post',
			body: body,
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
		try {
			this.log.debug(`Write [ ${oid} ] with value: ${value}`);
			const response = await this.client.fetch(this.getUrl, options);
			if (response.ok != true)
				this.log.debug(`writing ${oid} failed" Message: ${JSON.stringify(response.statusText)}`);
		} catch (error) {
			this.log.error(`OID (${oid}) write error: ${JSON.stringify(error)}`);
			this.setState('info.connection', false, true);
		}
	}

	/**
	 * Ochnser API for getting the oidNames Dictionary,
	 * 		either from file
	 * 		or
	 * 		from device (then stored to file)
	 *
	 * @returns oiNameDictionary
	 */
	private async oidGetNames(): Promise<{ [id: string]: string }> {
		let oidNamesDict: { [id: string]: string } = {};
		const fileName = 'oidNames.json';
		try {
			const oidNamesExists = await this.fileExistsAsync(this.namespace, fileName);
			if (oidNamesExists) {
				this.log.debug('oidNames exists');
				const res = await this.readFileAsync(this.namespace, fileName);
				// @ts-expect-error Type of res in invalid.
				oidNamesDict = JSON.parse(res.file);
				// this.log.info(`res: ${JSON.stringify(res.file)}`);
			} else {
				const response = await this.client.fetch(
					'http://192.168.1.108/res/xml/VarIdentTexte_de.xml',
					getOptions,
				);
				const data = await response.text();
				const result = await parseStringPromise(data);

				for (const gnIndex in result['VarIdentTexte']['gn']) {
					for (const mnIndex in result['VarIdentTexte']['gn'][gnIndex]['mn']) {
						let gn = result['VarIdentTexte']['gn'][gnIndex]['$']['id'];
						let mn = result['VarIdentTexte']['gn'][gnIndex]['mn'][mnIndex]['$']['id'];
						if (gn.length == 1) gn = '0' + gn;
						if (mn.length == 1) mn = '0' + mn;
						const key = `${gn}:${mn}`;
						oidNamesDict[key] = result['VarIdentTexte']['gn'][gnIndex]['mn'][mnIndex]['_'];
					}
				}
				await this.writeFileAsync(this.namespace, fileName, JSON.stringify(oidNamesDict));
				this.log.debug(`${fileName} written to 'Files'`);
				// return oidNamesDict;
			}
		} catch (error) {
			this.log.error(`oidGetNames error: ${JSON.stringify(error)}`);
		}
		return oidNamesDict;
	}

	/**
	 * Ochnser API for getting the oidEnum Dictionary,
	 * 		either from file
	 * 		or
	 * 		from device (then stored to file)
	 *
	 * @returns oidEnumDictionary
	 */
	private async oidGetEnums(): Promise<{ [id: string]: string[] }> {
		let oidEnumsDict: { [id: string]: string[] } = {};
		const fileName = 'oidEnums.json';
		try {
			const oidEnumsExists = await this.fileExistsAsync(this.namespace, fileName);
			if (oidEnumsExists) {
				this.log.debug('oidEnums exists');
				const res = await this.readFileAsync(this.namespace, fileName);
				// @ts-expect-error Type of res in invalid.
				oidEnumsDict = JSON.parse(res.file);
				// this.log.info(`res: ${JSON.stringify(res.file)}`);
			} else {
				const response = await this.client.fetch(
					'http://192.168.1.108/res/xml/AufzaehlTexte_de.xml',
					getOptions,
				);
				const data = await response.text();
				const result = await parseStringPromise(data);
				// console.log(JSON.stringify(result['AufzaehlTexte']['gn'], null, 2));
				for (const gnIndex in result['AufzaehlTexte']['gn']) {
					for (const mnIndex in result['AufzaehlTexte']['gn'][gnIndex]['mn']) {
						let gn = result['AufzaehlTexte']['gn'][gnIndex]['$']['id'];
						let mn = result['AufzaehlTexte']['gn'][gnIndex]['mn'][mnIndex]['$']['id'];
						gn = gn.length == 1 ? '0' + gn : gn;
						mn = mn.length == 1 ? '0' + mn : mn;
						const key = `${gn}:${mn}`;
						const enumArray: string[] = [];
						for (const enumIndex in result['AufzaehlTexte']['gn'][gnIndex]['mn'][mnIndex]['enum']) {
							const index = parseInt(
								result['AufzaehlTexte']['gn'][gnIndex]['mn'][mnIndex]['enum'][enumIndex]['$']['id'],
							);
							enumArray[index] =
								result['AufzaehlTexte']['gn'][gnIndex]['mn'][mnIndex]['enum'][enumIndex]['_'];
						}
						oidEnumsDict[key] = enumArray;
					}
				}
				await this.writeFileAsync(this.namespace, fileName, JSON.stringify(oidEnumsDict));
				this.log.debug(`${fileName} written to 'Files'`);
				// return oidEnumsDict;
			}
		} catch (error) {
			console.log('error:', { error });
		}
		return oidEnumsDict;
	}
	/**
	 * Ochnser API for getting the DeviceInfo
	 * @returns
	 */
	private async checkForConnection(): Promise<boolean> {
		// this.log.debug('DeviceInfo URL: ' + this.deviceInfoUrl);
		try {
			const response = await this.client.fetch(this.deviceInfoUrl, getOptions);
			const data = await response.json();
			this.log.info('DeviceInfo: ' + JSON.stringify(data));
			this.setStateAsync('deviceInfo.name', { val: data.device, ack: true });
			this.setStateAsync('deviceInfo.version', { val: data.version, ack: true });
		} catch (error) {
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
