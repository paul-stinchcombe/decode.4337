import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('txDecode', {
	decode: (hash: string, chainId: string, verbose: boolean) =>
		ipcRenderer.invoke('decode', hash, chainId, verbose),
});
