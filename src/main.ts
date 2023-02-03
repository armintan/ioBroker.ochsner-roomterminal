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

class OchsnerRoomterminal extends utils.Adapter {
	private deviceInfoUrl = '';
	private getUrl = '';
	private client: any | undefined = undefined;
	private timeoutID: NodeJS.Timeout | string | number | undefined = undefined;
	private oidNamesDict: { [id: string]: string } | undefined = undefined;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: adapterName!,
		});
		console.log('Adapter Name:', this.name);
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		// Initialize your adapter here
		this.log.info(`Adapter Name: ${this.name} is ready !!!!!!`);
		this.main();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			// timeout may still may active -> clear to stop polling
			// clearTimeout(this.timeoutID);
			this.log.debug('clear polling succeeded');
		} catch (e) {
			this.log.error(`clear timeout error`);
			// this.log.debug(`clear timeout error: ${JSON.stringify(e, null, 2)}`);
		} finally {
			this.log.info('Unloading ....');
			callback();
		}
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
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
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
	// private onMessage(obj: ioBroker.Message): void {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }

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

		this.log.info(`Config: ${JSON.stringify(this.config, null, 2)}`);

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

		/*
	For every state in the system there has to be also an object of type state
	Here a simple template for a boolean variable named "testVariable"
	Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
	*/
		await this.setObjectNotExistsAsync('testVariable', {
			type: 'state',
			common: {
				name: 'testVariable',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: true,
			},
			native: {},
		});

		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		this.subscribeStates('testVariable');
		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// this.subscribeStates('lights.*');
		// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		// this.subscribeStates('*');

		// Start polling the OID's with the given pollingIntervall
		this.oidNamesDict = await this.oidGetNames();
		if (this.config.OIDs.length > 0) this.poll();
	}

	/**
	 * Main polling routine - fetching next OID in list
	 *
	 * @description Started once during startup, restarts itself when finished
	 */
	private async poll(index = 0): Promise<void> {
		this.log.debug(`poll with index: ${index}`);
		// read the next OID from rommterminal
		await this.oidRead(index);

		// wait before reading the next OID, log error (just in case)
		// try {
		// 	await this.wait(this.config.pollInterval);
		// 	this.poll(index == this.config.OIDs.length - 1 ? 0 : index + 1);
		// } catch (error) {
		// 	this.log.error(`Error: ${JSON.stringify(error)}`);
		// 	this.poll();
		// }
		try {
			await this.delay(this.config.pollInterval);
			this.poll(index == this.config.OIDs.length - 1 ? 0 : index + 1);
		} catch (error) {
			this.log.error(`Error: ${JSON.stringify(error)}`);
			this.poll();
		}
	}

	/**
	 * Wait helper function, used in polling routine
	 * @param t time to wait
	 * @returns Promise<number>
	 */
	private wait(t: number): Promise<number | void> {
		return new Promise((s) => (this.timeoutID = setTimeout(s, t, t)));
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
		const namespace = this.name + '.admin';
		// const namespace = this.namespace;
		const fileName = 'oidNames.json';
		this.log.debug(`Namespace: ${namespace}`);
		try {
			const oidNamesExists = await this.fileExistsAsync(namespace, fileName);
			if (oidNamesExists) {
				this.log.debug('oidNames exists');
				const res = await this.readFileAsync(namespace, fileName);
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
				await this.writeFileAsync(namespace, fileName, JSON.stringify(oidNamesDict));
				this.log.debug('oidNames wirtten to files');
				return oidNamesDict;
			}
		} catch (error) {
			this.log.error(`oidGetNames error: ${JSON.stringify(error)}`);
		}
		return oidNamesDict;
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

	/**
	 * Read OID from roomterminal, given by index
	 *
	 * @param index index of the OID etnry to tread in this.config.OiDs
	 */
	private async oidRead(index: number): Promise<void> {
		// this.log.debug(JSON.stringify(oids, null, 2));
		// this.log.debug(JSON.stringify(status, null, 2));
		const oid = this.config.OIDs[index].oid;
		this.log.info(`Polling OID: ${oid}`);

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
			 <oid>${oid}</oid>
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
				SOAPAction: 'http://ws01.lom.ch/soap/listDP',
				'Cache-Control': 'no-cache',
				'Content-Type': 'text/xml; charset=utf-8',
				'Content-length': body.length,
			},
		};
		try {
			const response = await this.client.fetch(this.getUrl, options);
			const data = await response.text();
			const jsonResult = await parseStringPromise(data);
			const name: string =
				jsonResult['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['ns:getDpResponse'][0].dpCfg[0].name[0];
			const value: string =
				jsonResult['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['ns:getDpResponse'][0].dpCfg[0].value[0];
			const unit: string =
				jsonResult['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['ns:getDpResponse'][0].dpCfg[0].unit[0];
			const step: string =
				jsonResult['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['ns:getDpResponse'][0].dpCfg[0].step[0];
			const min: string =
				jsonResult['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['ns:getDpResponse'][0].dpCfg[0].minValue[0];
			const max: string =
				jsonResult['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['ns:getDpResponse'][0].dpCfg[0].maxValue[0];
			const prop: string =
				jsonResult['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['ns:getDpResponse'][0].dpCfg[0].prop[0];
			// this.log.debug(`${JSON.stringify(common, null, 2)}`);

			const common: ioBroker.StateCommon = {
				name: this.oidNamesDict![name].length ? this.oidNamesDict![name] : this.config.OIDs[index].name,
				type: 'number',
				role: 'value',
				read: prop[1] === 'r' ? true : false,
				write: prop[2] === 'w' ? true : false,
				unit: unit.length === 0 ? undefined : unit,
				min: min.length === 0 ? undefined : Number(min),
				max: max.length === 0 ? undefined : Number(max),
				step: step.length === 0 ? undefined : Number(step),
				// states: { '0': 'OFF', '1': 'ON', '-3': 'whatever' },
			};

			this.log.debug(`${JSON.stringify(common, null, 2)}`);
			// this.log.info(`data: ${JSON.stringify(result, null, 2)}`);
			if (value.length > 0) {
				this.log.debug('Got a valid result: ' + value + unit);

				//TODO: add read / write based on XML
				await this.setObjectNotExistsAsync('OID.' + oid, {
					type: 'state',
					common,
					native: {},
				});

				this.setState('OID.' + oid, { val: Number(value), ack: true });
			} else {
				this.log.error(`result for ${oid} not valid`);
				this.setState('info.connection', false, true);
			}
		} catch (error) {
			this.log.error(`OID read error: ${oid}`);
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new OchsnerRoomterminal(options);
} else {
	// otherwise start the instance directly
	(() => new OchsnerRoomterminal())();
}
