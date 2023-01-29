import React from 'react';

import GenericApp from '@iobroker/adapter-react-v5/GenericApp';
import Settings from './components/settings';
import { GenericAppProps, GenericAppSettings } from '@iobroker/adapter-react-v5/types';
import { StyleRules } from '@mui/styles';
import { withStyles } from '@mui/styles';

import { addKeyIdToArray } from './lib/utils';
import Table from './components/Table';
import { GridOIDs } from './lib/typings';

const styles = (_theme): StyleRules => ({});

class App extends GenericApp {
	gridOIDs: GridOIDs[] | undefined;
	constructor(props: GenericAppProps) {
		const extendedProps: GenericAppSettings = {
			...props,
			encryptedFields: [],
			translations: {
				en: require('./i18n/en.json'),
				de: require('./i18n/de.json'),
				ru: require('./i18n/ru.json'),
				pt: require('./i18n/pt.json'),
				nl: require('./i18n/nl.json'),
				fr: require('./i18n/fr.json'),
				it: require('./i18n/it.json'),
				es: require('./i18n/es.json'),
				pl: require('./i18n/pl.json'),
				'zh-cn': require('./i18n/zh-cn.json'),
			},
		};
		super(props, extendedProps);
	}

	onConnectionReady(): void {
		// executed when web-socket connection is ready
		this.gridOIDs = addKeyIdToArray(this.state.native['OIDs']) as GridOIDs[];
		this.forceUpdate();
	}

	onPrepareSave(settings: Record<string, any>): boolean {
		// console.log(`onPrepareSave: ${JSON.stringify(settings, null, 2)}`);
		return super.onPrepareSave(settings);
	}

	render() {
		if (!this.state.loaded) {
			return super.render();
		}

		return (
			<div className="App">
				<Settings native={this.state.native} onChange={(attr, value) => this.updateNativeValue(attr, value)} />
				<Table oids={this.gridOIDs} />
				{this.renderError()}
				{this.renderToast()}
				{this.renderSaveCloseButtons()}
			</div>
		);
	}
}

export default withStyles(styles)(App);
