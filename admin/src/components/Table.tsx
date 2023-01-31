import React from 'react';
import TreeTable from '@iobroker/adapter-react-v5/Components/TreeTable';
import { withStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import I18n from '@iobroker/adapter-react-v5/i18n';
import { GridOID } from '../lib/typings';

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
					onUpdate={(newData: GridOID | boolean, oldData: GridOID) => {
						// const data = JSON.parse(JSON.stringify(this.state.data));
						const data: GridOID[] = [...this.props.native['OIDs']];

						if (newData === true) {
							// new line was added
							console.log({ oldData });

							// find unique ID
							let id = 0;
							while (data.find((item) => item.id === id)) {
								id++;
								// id = 'line_' + i;
							}
							// add new line
							data.push({
								id,
								oid: 'e.g. /1/2/1/97/0',
								name: '',
								isWriteable: false,
								enabled: false,
								isStatus: false,
								statusID: '',
							});
						} else {
							// existing line was modifed
							if (newData == false) return; // should never happen, but makes lint happy :-)
							const pos = this.props.native['OIDs'].indexOf(oldData);
							if (pos !== -1) {
								data[pos] = newData;
							}
						}
						this.props.onChange('OIDs', data);
					}}
					onDelete={(oldData: GridOID) => {
						console.log('Delete: ' + JSON.stringify(oldData));
						// const pos = this.state.data.indexOf(oldData);
						const data = [...this.props.native['OIDs']];
						// if (pos !== -1) {
						// const data = JSON.parse(JSON.stringify(this.state.data));
						this.props.onChange(
							'OIDs',
							data.filter((item) => item.id != oldData.id),
						);
					}}
				/>
			</Paper>
		);
	}
}
export default withStyles(styles)(Table);
