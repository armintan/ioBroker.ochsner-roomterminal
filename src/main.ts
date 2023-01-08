/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';

// Load your modules here, e.g.:
import DigestFetch from 'digest-fetch';
// import * as fs from "fs";

class OchsnerRoomterminal extends utils.Adapter {
	private deviceInfoUrl = '';

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'ochsner-roomterminal',
		});
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
		this.main();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (e) {
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
	// 	} else {
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
		this.poll();
	}

	private async poll(): Promise<void> {
		this.log.debug('Polling....');

		// wait for the next value to read, log error (just in case)
		this.wait(this.config.pollInterval)
			.then(() => this.poll())
			.catch((error) => {
				this.log.error(JSON.stringify(error));
				this.poll();
			});
	}

	/**
	 * Wait helper function, used in polling routine
	 * @param t time to wait
	 * @returns Promise<number>
	 */
	private wait(t: number): Promise<number> {
		return new Promise((s) => setTimeout(s, t, t));
	}
	/**
	 * Ochnser API for getting the DeviceInfo
	 * @returns
	 */
	private async checkForConnection(): Promise<boolean> {
		const client = new DigestFetch(this.config.username, this.config.password);

		const options = {
			method: 'get',
			headers: {
				'Content-Type': 'application/json; charset=UTF-8',
				'Cache-Control': 'no-cache',
				Connection: 'Keep-Alive',
				Accept: '*.*',
			},
		};
		this.log.debug('DeviceInfo URL: ' + this.deviceInfoUrl);
		try {
			const response = await client.fetch(this.deviceInfoUrl, options);
			const data = await response.json();
			this.log.info('DeviceInfo: ' + JSON.stringify(data));
			await this.setStateAsync('deviceInfo.name', { val: data.device, ack: true });
			await this.setStateAsync('deviceInfo.version', { val: data.version, ack: true });
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
