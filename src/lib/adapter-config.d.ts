// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface OID {
			enabled: boolean;
			oid: string;
			name: string;
			isStatus: boolean;
			group: number;
			// isWriteable: boolean;
			// statusID: string;
		}

		interface AdapterConfig {
			username: string;
			password: string;
			serverIP: string;
			pollInterval: number;
			OIDs: OID[];
			// Status: [{ statusID: string; statusValue: number; statusText; string }];
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
