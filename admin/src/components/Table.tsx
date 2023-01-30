import React from 'react';
import TreeTable from '@iobroker/adapter-react-v5/Components/TreeTable';
import { withStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import I18n from '@iobroker/adapter-react-v5/i18n';

// STYLES
const styles = (_theme) => ({
	// tableDiv: {
	// 	width: '100%',
	// 	overflow: 'hidden',
	// 	height: 'calc(100% - 48px)',
	// },
});

interface IProps {
	classes: Record<string, string>;
	native: Record<string, any>;

	onChange: (attr: string, value: any) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IState {
	// columns: any;
	// pageSize: number;
	// rowId: GridRowId | null;
}

class Table extends React.Component<IProps, IState> {
	columns: any;
	constructor(props) {
		super(props);

		this.columns = [
			{
				title: 'ID', // required, else it will be "field"
				field: 'id', // required
				editable: 'false', // or true [default - true]
				type: 'string', // oid=ObjectID,icon=base64-icon
				// hidden: true,
				cellStyle: {
					// 	CSS style - // optional
					display: 'none',
					opacitiy: 0.2,
				},
			},
			{
				title: 'OID', // required, else it will be "field"
				field: 'oid', // required
				editable: true, // or true [default - true]
				type: 'string', // oid=ObjectID,icon=base64-icon
				cellStyle: {
					// 	CSS style - // optional
					minWidth: 100,
				},
				// editComponent: (props) => (
				// 	<div>
				// 		Prefix&#123; <br />
				// 		<textarea
				// 			rows={4}
				// 			style={{ width: '100%', resize: 'vertical' }}
				// 			value={props.value}
				// 			onChange={(e) => props.onChange(e.target.value)}
				// 		/>
				// 		Suffix
				// 	</div>
				// ),
			},
			{
				title: I18n.t('Name'), // required, else it will be "field"
				field: 'name', // required
				editable: true, // or true [default - true]
				type: 'string', // oid=ObjectID,icon=base64-icon
				cellStyle: {
					// 	CSS style - // optional
					minWidth: 100,
				},
				// editComponent: (props) => (
				// 	<div>
				// 		Prefix&#123; <br />
				// 		<textarea
				// 			rows={4}
				// 			style={{ width: '100%', resize: 'vertical' }}
				// 			value={props.value}
				// 			onChange={(e) => props.onChange(e.target.value)}
				// 		/>
				// 		Suffix
				// 	</div>
				// ),
			},
			{
				title: I18n.t('Enabled'), // required, else it will be "field"
				field: 'enabled', // required
				editable: true, // or true [default - true]
				type: 'boolean',
			},
			{
				title: I18n.t('is writeable'), // required, else it will be "field"
				field: 'isWriteable', // required
				editable: true, // or true [default - true]
				type: 'boolean', // oid=ObjectID,icon=base64-icon
			},
		];
	}
	// renderTable
	render() {
		return (
			<Paper className="Paper" sx={{ width: 0.99, m: 1 }}>
				<TreeTable
					columns={this.columns}
					data={this.props.native['OIDs']}
					onUpdate={(newData: any, oldData: any) => {
						const pos = this.props.native['OIDs'].indexOf(oldData);
						if (pos !== -1) {
							const data = [...this.props.native['OIDs']];
							data[pos] = newData;
							this.props.onChange('OIDs', data);
						}
						// const data = JSON.parse(JSON.stringify(this.state.data));

						// // Added new line
						// if (newData === true) {
						// 	// find unique ID
						// 	let i = 1;
						// 	let id = 'line_' + i;

						// 	// eslint-disable-next-line
						// 	while (this.state.data.find((item) => item.id === id)) {
						// 		i++;
						// 		id = 'line_' + i;
						// 	}

						// 	data.push({
						// 		id,
						// 		name: I18n.t('New resource') + '_' + i,
						// 		color: '',
						// 		icon: '',
						// 		unit: '',
						// 		price: 0,
						// 	});
						// } else {
						// 	// existing line was modifed
						// 	const pos = this.state.data.indexOf(oldData);
						// 	if (pos !== -1) {
						// 		Object.keys(newData).forEach((attr) => (data[pos][attr] = newData[attr]));
						// 	}
						// }

						// this.setState({ data });
					}}
					onDelete={(oldData) => {
						console.log('Delete: ' + JSON.stringify(oldData));
						// const pos = this.state.data.indexOf(oldData);
						const data = [...this.props.native['OIDs']];
						// if (pos !== -1) {
						// const data = JSON.parse(JSON.stringify(this.state.data));
						this.props.onChange(
							'OIDs',
							data.filter((item) => item.id != oldData.id),
						);

						// }
					}}
				/>
			</Paper>
		);
	}
}
export default withStyles(styles)(Table);
