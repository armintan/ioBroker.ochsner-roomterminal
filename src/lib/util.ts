export const getEnumKeys = (prop: string): string[] | null => {
	// match everthing behind 'enum = '
	const regex = /(?<=enum = )(\d|,)*$/g;
	const found = prop.match(regex);
	if (found) return found[0].split(',');
	else return null;
};
