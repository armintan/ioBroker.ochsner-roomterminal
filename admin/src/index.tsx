import React from 'react';
import ReactDOM from 'react-dom';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { StylesProvider, createGenerateClassName } from '@mui/styles';
// import './index.css';
import App from './App';
import pack from '../../package.json';
import theme from '@iobroker/adapter-react-v5/Theme';
import Utils from '@iobroker/adapter-react-v5/Components/Utils';

const adapterName = 'roomterminal';

let themeName = Utils.getThemeName();

console.log(`iobroker.${adapterName}@${pack.version} using theme "${themeName}"`);

const generateClassName = createGenerateClassName({
	productionPrefix: 'roomterminal',
});

function build() {
	const container = document.getElementById('root');
	ReactDOM.render(
		<StylesProvider generateClassName={generateClassName}>
			<StyledEngineProvider injectFirst>
				<ThemeProvider theme={theme(themeName)}>
					<App
						onThemeChange={(_theme) => {
							themeName = _theme;
							build();
						}}
					/>
				</ThemeProvider>
			</StyledEngineProvider>
		</StylesProvider>,
		container,
	);
}

build();
