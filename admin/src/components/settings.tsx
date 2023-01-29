import React from 'react';
import { withStyles } from '@mui/styles';
import { CreateCSSProperties } from '@mui/styles/withStyles';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
// import Select from '@mui/material/Select';
import Paper from '@mui/material/Paper';
// import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import I18n from '@iobroker/adapter-react-v5/i18n';

const styles = (): Record<string, CreateCSSProperties> => ({
	// inputForm: {
	// 	flexDirection: 'row',
	// 	width: '100%',
	// 	flexWrap: 'wrap',
	// 	justifyContent: 'space-between',
	// 	marginTop: 25,
	// 	paddingLeft: 12,
	// 	paddingRight: 12,
	// },
	// input: {
	// 	paddingLeft: 5,
	// 	paddingRight: 5,
	// 	minWidth: 250,
	// },
	// button: {
	// 	marginRight: 20,
	// },
	Paper: {
		// background: red[200],
	},
});

interface SettingsProps {
	// classes: Record<string, string>;
	native: Record<string, any>;

	onChange: (attr: string, value: any) => void;
}

interface SettingsState {
	// add your state properties here
	dummy?: undefined;
}

class Settings extends React.Component<SettingsProps, SettingsState> {
	constructor(props: SettingsProps) {
		super(props);
		this.state = {};
	}

	renderInput(title: AdminWord, attr: string, type: string) {
		return (
			<Paper className="Paper" sx={{ width: 0.99, m: 1 }}>
				{/* <TextField
					id="standard-basic"
					label={I18n.t(title)}
					className={`${this.props.classes.input} ${this.props.classes.controlElement}`}
					value={this.props.native[attr]}
					type={type || 'text'}
					onChange={(e) => this.props.onChange(attr, e.target.value)}
					margin="normal"
				/> */}
				<Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-around' }}>
					<Box>
						<TextField
							sx={{ minWidth: 250, px: 1 }}
							id="standard-basic"
							label={I18n.t('Username')}
							// className={`${this.props.classes.input} ${this.props.classes.input}`}
							value={this.props.native['username']}
							type="text"
							onChange={(e) => this.props.onChange('username', e.target.value)}
							size="small"
							margin="normal"
							variant="standard"
						/>
						<TextField
							sx={{ minWidth: 250, px: 1 }}
							id="standard-basic"
							label={I18n.t('Password')}
							// className={`${this.props.classes.input} ${this.props.classes.controlElement}`}
							value={this.props.native['password']}
							type="text"
							onChange={(e) => this.props.onChange('password', e.target.value)}
							size="small"
							margin="normal"
							variant="standard"
						/>
					</Box>
					<Box>
						<TextField
							sx={{ minWidth: 250, px: 1 }}
							id="standard-basic"
							label={I18n.t('Server')}
							// className={`${this.props.classes.input} ${this.props.classes.controlElement}`}
							value={this.props.native['serverIP']}
							type="text"
							onChange={(e) => this.props.onChange('serverIP', e.target.value)}
							size="small"
							margin="normal"
							variant="standard"
						/>
						<TextField
							sx={{ minWidth: 250, px: 1 }}
							id="standard-basic"
							label={I18n.t(title)}
							// className={`${this.props.classes.input} ${this.props.classes.controlElement}`}
							value={this.props.native[attr]}
							type={type || 'text'}
							onChange={(e) => this.props.onChange(attr, e.target.value)}
							margin="normal"
							variant="standard"
						/>
					</Box>
				</Box>
			</Paper>
		);
	}

	// renderSelect(
	// 	title: AdminWord,
	// 	attr: string,
	// 	options: { value: string; title: AdminWord }[],
	// 	style?: React.CSSProperties,
	// ) {
	// 	return (
	// 		<FormControl
	// 			className={`${this.props.classes.input} ${this.props.classes.controlElement}`}
	// 			style={{
	// 				paddingTop: 5,
	// 				...style,
	// 			}}
	// 		>
	// 			<Select
	// 				value={this.props.native[attr] || '_'}
	// 				onChange={(e) => this.props.onChange(attr, e.target.value === '_' ? '' : e.target.value)}
	// 				input={<Input name={attr} variant={attr + '-helper'} />}
	// 			>
	// 				{options.map((item) => (
	// 					<MenuItem key={'key-' + item.value} value={item.value || '_'}>
	// 						{I18n.t(item.title)}
	// 					</MenuItem>
	// 				))}
	// 			</Select>
	// 			<FormHelperText>{I18n.t(title)}</FormHelperText>
	// 		</FormControl>
	// 	);
	// }

	renderCheckbox(title: AdminWord, attr: string, style?: React.CSSProperties) {
		return (
			<FormControlLabel
				key={attr}
				style={{
					paddingTop: 5,
					...style,
				}}
				// className={this.props.classes.controlElement}
				control={
					<Checkbox
						checked={this.props.native[attr]}
						onChange={() => this.props.onChange(attr, !this.props.native[attr])}
						color="primary"
					/>
				}
				label={I18n.t(title)}
			/>
		);
	}

	render() {
		return (
			<form>
				{/* TODO:  parameters only used for last input field */}
				{this.renderInput('Interval', 'pollInterval', 'number')}
				<br />
				{/* {this.renderCheckbox('option1', 'option1')} */}
			</form>
		);
	}
}

export default withStyles(styles)(Settings);
