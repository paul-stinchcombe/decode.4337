import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { decodeTransaction, parseChainId } from './decode';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 560,
		height: 520,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	mainWindow.loadFile(path.join(__dirname, 'index.html'));
	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

const MIN_HEIGHT = 520;
const MAX_HEIGHT = 1000;
const WIDTH = 560;

ipcMain.on('resize-window', (_, height: number) => {
	if (mainWindow && !mainWindow.isDestroyed()) {
		const h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(height)));
		mainWindow.setContentSize(WIDTH, h);
	}
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
	app.quit();
});

ipcMain.handle(
	'decode',
	async (
		_,
		hash: string,
		chainIdInput: string,
		verbose: boolean,
	): Promise<{
		success: boolean;
		calls?: Array<{ function: string; target: string; args: Record<string, string> }>;
		summary?: { amount: string; from: string; beneficiary: string };
		verboseOutput?: string;
		gasUsed?: string;
		gasPriceGwei?: string;
		error?: string;
	}> => {
		try {
			const chainId = parseChainId(chainIdInput);
			return await decodeTransaction(
				hash as `0x${string}`,
				chainId,
				verbose,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { success: false, error: message };
		}
	},
);
