import React from 'react';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import { GridRenderCellParams, GridRowId } from '@mui/x-data-grid';
import { Delete } from '@mui/icons-material';

interface IProps {
	params: GridRenderCellParams<any, any, any>;
	rowId: GridRowId;
	setRowId: React.Dispatch<React.SetStateAction<GridRowId>>;
	handleDelete: React.MouseEventHandler<HTMLButtonElement>;
}

const TableActions: React.FC<IProps> = ({ params, rowId, setRowId, handleDelete }) => {
	// const handleSave = () => {};

	return (
		<Box sx={{ m: 1, position: 'relative' }}>
			{/* <Fab
				disabled={params.id !== rowId}
				color="primary"
				sx={{
					width: 40,
					height: 40,
					// bgcolor: green[400],
					// '$:hover': { bgcolor: green[700] },
				}}
				onClick={handleSave}
			>
				<Save />
			</Fab> */}
			<Fab
				color="primary"
				sx={{
					width: 40,
					height: 40,
					// bgcolor: green[400],
					// '$:hover': { bgcolor: green[700] },
				}}
				onClick={handleDelete}
			>
				<Delete />
			</Fab>
		</Box>
	);
};

export default TableActions;
