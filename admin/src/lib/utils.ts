// import DigestFetch from 'digest-fetch';
// import { extend, map } from 'lodash';
// import { parseStringPromise } from 'xml2js';

// export const addKeyIdToArray = (input: any[]): any[] => map(input, (element, key) => extend({}, element, { id: key }));

// export const changeRowWithId = (id: string | number, array: any[], newRow: any): any[] => {
// 	const index = findIndex(array, (row) => row.id === id);
// 	array[index] = newRow;
// 	console.log({ array });
// 	return array;
// };

// const getOptions = {
// 	method: 'get',
// 	headers: {
// 		Connection: 'Keep-Alive',
// 		Accept: 'text/xml',
// 		Pragma: 'no-cache',
// 		'Cache-Control': 'no-cache',
// 		'Content-Type': 'text/xml; charset=utf-8',
// 	},
// };

/**
 * Ochnser API for getting the oidNames Dictionary,
 * 		either from file
 * 		or
 * 		from device (then stored to file)
 *
 * @returns oiNameDictionary
 */
// export const oidGetNames = async (
// 	// adapterName: string,
// 	username: string,
// 	password: string,
// ): Promise<{ [id: string]: string }> => {
// 	const oidNamesDict: { [id: string]: string } = {};
// 	const fileName = 'oidNames.json';

// 	console.log(utils.getAbsoluteDefaultDataDir());
// 	// console.log(utils.getAbsoluteInstanceDataDir(adapterName));

// 	try {
// 		await access(fileName, constants.R_OK | constants.W_OK);
// 		console.log('oidNames exists');
// 		const res = await readFile(fileName);
// 		console.log({ res });
// 		// @ts-expect-error Type of res in invalid.
// 		// oidNamesDict = JSON.parse(res.file);
// 		// this.log.info(`res: ${JSON.stringify(res.file)}`);
// 	} catch {
// 		// this.log.error(`oidGetNames error: ${JSON.stringify(error)}`);
// 		console.error('oidNames did not exist');
// 		try {
// 			const client = new DigestFetch(username, password);

// 			const response = await client.fetch('http://192.168.1.108/res/xml/VarIdentTexte_de.xml', getOptions);
// 			const data = await response.text();
// 			const result = await parseStringPromise(data);

// 			for (const gnIndex in result['VarIdentTexte']['gn']) {
// 				for (const mnIndex in result['VarIdentTexte']['gn'][gnIndex]['mn']) {
// 					let gn = result['VarIdentTexte']['gn'][gnIndex]['$']['id'];
// 					let mn = result['VarIdentTexte']['gn'][gnIndex]['mn'][mnIndex]['$']['id'];
// 					if (gn.length == 1) gn = '0' + gn;
// 					if (mn.length == 1) mn = '0' + mn;
// 					const key = `${gn}:${mn}`;
// 					oidNamesDict[key] = result['VarIdentTexte']['gn'][gnIndex]['mn'][mnIndex]['_'];
// 				}
// 			}
// 			// await writeFile(fileName, JSON.stringify(oidNamesDict));
// 			console.log('oidNames wirtten to files');
// 			return oidNamesDict;
// 		} catch (error) {}
// 	}
// 	return oidNamesDict;
// };
