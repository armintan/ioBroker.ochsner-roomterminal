import { extend, map } from 'lodash';

export const addKeyIdToArray = (input: any[]): any[] => map(input, (element, key) => extend({}, element, { id: key }));
