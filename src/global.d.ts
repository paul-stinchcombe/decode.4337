export {};

declare global {
	interface Window {
		txDecode: {
			requestResize: (heightPx: number) => void;
			decode: (
				hash: string,
				chainId: string,
				verbose: boolean,
			) => Promise<{
				success: boolean;
				calls?: Array<{ function: string; target: string; args: Record<string, string> }>;
				summary?: { amount: string; from: string; beneficiary: string };
				verboseOutput?: string;
				gasUsed?: string;
				gasPriceGwei?: string;
				error?: string;
			}>;
		};
	}
}
