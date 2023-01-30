import { extend, map } from 'lodash';

export const addKeyIdToArray = (input: any[]): any[] => map(input, (element, key) => extend({}, element, { id: key }));

// export const changeRowWithId = (id: string | number, array: any[], newRow: any): any[] => {
// 	const index = findIndex(array, (row) => row.id === id);
// 	array[index] = newRow;
// 	console.log({ array });
// 	return array;
// };
