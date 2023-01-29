import React from 'react';
// import { GridColDef, gridClasses, GridRowId } from '@mui/x-data-grid';
import { GridColDef, DataGrid, gridClasses, GridRowId } from '@mui/x-data-grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import grey from '@mui/material/colors/grey';
import { GridOIDs } from '../lib/typings';
import TableActions from './TableActions';

interface IProps {
	// classes: Record<string, string>;
	oids: GridOIDs[] | undefined;

	// onChange: (attr: string, value: any) => void;
}

const Table: React.FC<IProps> = (props: IProps) => {
	const [pageSize, setPageSize] = React.useState(10);
	const [rowId, setRowId] = React.useState<GridRowId>('');

	const handleDelete: React.MouseEventHandler<HTMLButtonElement> = (event) => {
		console.log(event.target);
	};
	const handleAddRow: React.MouseEventHandler<HTMLButtonElement> = (event) => {
		console.log(event.target);
	};

	const columns = React.useMemo<GridColDef[]>(
		() => [
			{
				field: 'enabled',
				headerName: 'Enabled',
				type: 'boolean',
				width: 100,
				editable: true,
				sortable: false,
			},
			{
				field: 'oid',
				headerName: 'OID',
				type: 'string',
				width: 250,
				editable: true,
			},
			{
				field: 'name',
				headerName: 'Name',
				type: 'string',
				width: 300,
				editable: true,
			},
			{
				field: 'isWriteable',
				headerName: 'is writable',
				description: 'This column has a value getter and is not sortable.',
				type: 'boolean',
				editable: true,
				sortable: false,
				width: 100,
				// valueGetter: (params: GridValueGetterParams) =>
				//   `${params.row.firstName || ''} ${params.row.lastName || ''}`,
			},
			{
				field: 'isState',
				headerName: 'is State',
				description: 'If checked, this OID is writeable.',
				type: 'boolean',
				editable: true,
				sortable: false,
				width: 100,
			},
			{
				field: 'stateID',
				headerName: 'State ID',
				type: 'string',
				description: 'This is the stateID of the OID.',
				editable: true,
				sortable: false,
				width: 150,
				// valueGetter: (params: GridValueGetterParams) =>
				//   `${params.row.firstName || ''} ${params.row.lastName || ''}`,
			},
			{
				field: 'action',
				headerName: 'Actions',
				type: 'actions',
				description: 'These are the actions',
				renderCell: (params) => <TableActions {...{ params, rowId, setRowId, handleDelete }} />,
				width: 150,
				// valueGetter: (params: GridValueGetterParams) =>
				//   `${params.row.firstName || ''} ${params.row.lastName || ''}`,
			},
		],
		[rowId],
	);

	if (props.oids == undefined) return <div></div>;
	return (
		<Paper sx={{ width: '100%' }}>
			<Stack direction="row" spacing={1} sx={{ mb: 1 }}>
				<Button size="small" onClick={handleAddRow}>
					Add a row
				</Button>
			</Stack>
			<DataGrid
				sx={{
					[`& .${gridClasses.row}`]: {
						bgcolor: (theme) => (theme.palette.mode === 'light' ? grey[200] : grey[800]),
					},
				}}
				rows={props.oids}
				columns={columns}
				autoHeight
				pageSize={pageSize}
				rowsPerPageOptions={[5, 10, 20]}
				onPageSizeChange={(newPageSize) => setPageSize(newPageSize)}
				getRowSpacing={(params) => ({
					top: params.isFirstVisible ? 0 : 5,
					bottom: params.isLastVisible ? 0 : 5,
				})}
				disableSelectionOnClick
				experimentalFeatures={{ newEditingApi: true }}
				processRowUpdate={(newRow) => {
					console.log({ newRow });
					return newRow;
				}}
			/>
		</Paper>
	);
};

export default Table;
