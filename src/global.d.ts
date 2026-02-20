export {};

declare global {
	interface Window {
		txDecode: {
			decode: (
				hash: string,
				chainId: string,
				verbose: boolean,
			) => Promise<{
				success: boolean;
				summary?: { amount: string; from: string; beneficiary: string };
				verboseOutput?: string;
				error?: string;
			}>;
		};
	}
}
