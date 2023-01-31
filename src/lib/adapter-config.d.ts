// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface OID {
			enabled: boolean;
			oid: string;
			name: string;
			isWriteable: boolean;
			isStatus: boolean;
			statusID: string;
		}

		interface AdapterConfig {
			username: string;
			password: string;
			serverIP: string;
			pollInterval: number;
			OIDs: OID[];
			Status: [{ statusID: string; statusValue: number; statusText; string }];
		}
	}
}

// declare module 'digest-fetch';
// this is required so the above AdapterConfig is found by TypeScript / type checking

export {};
