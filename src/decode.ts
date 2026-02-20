import {
	createPublicClient,
	http,
	decodeFunctionData,
	Hex,
	formatEther,
	formatUnits,
	defineChain,
	type Chain,
} from 'viem';
import {
	base,
	mainnet,
	arbitrum,
	optimism,
	polygon,
	soneium,
	baseSepolia,
	arbitrumSepolia,
	sepolia,
	soneiumMinato,
} from 'viem/chains';
import { entryPoint07Abi, entryPoint07Address } from 'viem/account-abstraction';

const ENTRY_POINT_07 = entryPoint07Address as Hex;

const SIMPLE_ACCOUNT_EXECUTE_ABI = [
	{
		name: 'execute',
		type: 'function',
		inputs: [
			{ name: 'dest', type: 'address' },
			{ name: 'value', type: 'uint256' },
			{ name: 'func', type: 'bytes' },
		],
	},
	{
		name: 'executeBatch',
		type: 'function',
		inputs: [
			{ name: 'dest', type: 'address[]' },
			{ name: 'value', type: 'uint256[]' },
			{ name: 'func', type: 'bytes[]' },
		],
	},
] as const;

const ERC20_ABI = [
	{
		name: 'transfer',
		type: 'function',
		inputs: [
			{ name: 'to', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
	},
	{
		name: 'transferFrom',
		type: 'function',
		inputs: [
			{ name: 'from', type: 'address' },
			{ name: 'to', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
	},
	{
		name: 'approve',
		type: 'function',
		inputs: [
			{ name: 'spender', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
	},
] as const;

const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
	'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
	'0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
};

const CHAINS: Record<number, Chain> = {
	// Mainnets
	1: mainnet,
	8453: base,
	42161: arbitrum,
	10: optimism,
	137: polygon,
	1868: soneium,
	// Testnets
	11155111: sepolia,
	84532: baseSepolia,
	421614: arbitrumSepolia,
	1946: soneiumMinato,
};

export function parseChainId(value: string): number {
	const s = value.trim();
	const n =
		s.startsWith('0x') || s.startsWith('0X') ? parseInt(s, 16) : parseInt(s, 10);
	if (Number.isNaN(n) || n <= 0) {
		throw new Error(`Invalid chain ID: ${value}`);
	}
	return n;
}

function getChain(chainId: number): Chain {
	return (
		CHAINS[chainId] ??
		defineChain({
			id: chainId,
			name: `Chain ${chainId}`,
			nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
			rpcUrls: {
				default: { http: [`https://${chainId}.rpc.thirdweb.com`] },
			},
		})
	);
}

function formatTokenAmount(token: Hex, rawAmount: bigint): string {
	const key = token.toLowerCase();
	const known = KNOWN_TOKENS[key];
	if (known) {
		return `${formatUnits(rawAmount, known.decimals)} ${known.symbol}`;
	}
	return `${rawAmount.toString()} (unknown token)`;
}

function createClient(chain: Chain, rpcUrl?: string) {
	const url =
		rpcUrl ?? (chain.id === 8453 ? 'https://mainnet.base.org' : undefined);
	return createPublicClient({
		chain,
		transport: http(url),
	});
}

function tryDecodeInnerCall(data: Hex): string {
	try {
		const decoded = decodeFunctionData({
			abi: [...SIMPLE_ACCOUNT_EXECUTE_ABI, ...ERC20_ABI],
			data,
		});
		const args = decoded.args as unknown[];
		const argsStr = args
			.map((a) => (typeof a === 'bigint' ? a.toString() : a))
			.join(', ');
		return `${decoded.functionName}(${argsStr})`;
	} catch {
		return data.slice(0, 10) + '... (raw)';
	}
}

export interface DecodeResult {
	success: boolean;
	summary?: { amount: string; from: string; beneficiary: string };
	verboseOutput?: string;
	error?: string;
}

export async function decodeTransaction(
	hash: Hex,
	chainId: number,
	verbose: boolean,
	rpcUrl?: string,
): Promise<DecodeResult> {
	const lines: string[] = [];
	const log = (s: string) => lines.push(s);

	try {
		const chain = getChain(chainId);
		const client = createClient(chain, rpcUrl);
		const tx = await client.getTransaction({ hash });

		if (!tx.input || tx.input === '0x') {
			return {
				success: false,
				error: 'This is a simple ETH transfer with no data.',
			};
		}

		if (tx.to?.toLowerCase() === ENTRY_POINT_07.toLowerCase()) {
			const decoded = decodeFunctionData({
				abi: entryPoint07Abi,
				data: tx.input,
			});

			if (decoded.functionName === 'handleOps') {
				const [ops, beneficiary] = decoded.args as [
					Array<{
						sender: Hex;
						nonce: bigint;
						initCode: Hex;
						callData: Hex;
						accountGasLimits: Hex;
						preVerificationGas: bigint;
						gasFees: Hex;
						paymasterAndData: Hex;
						signature: Hex;
					}>,
					Hex,
				];

				let summary: {
					amount: string;
					from: Hex;
					beneficiary: Hex;
				} | null = null;

				if (verbose) {
					log('✅ Account Abstraction Transaction (Entry Point 0.7.0)');
					log('----------------------------------------');
					log(`Function: handleOps`);
					log(`Beneficiary: ${beneficiary}`);
					log(`User Operations: ${ops.length}`);
					log('----------------------------------------');
				}

				for (let i = 0; i < ops.length; i++) {
					const op = ops[i];

					if (verbose) {
						log(`\n📦 UserOp #${i + 1}`);
						log(`   Sender (Smart Account): ${op.sender}`);
						log(`   Nonce: ${op.nonce.toString()}`);
					}

					if (op.callData && op.callData !== '0x') {
						try {
							const innerDecoded = decodeFunctionData({
								abi: SIMPLE_ACCOUNT_EXECUTE_ABI,
								data: op.callData,
							});

							if (innerDecoded.functionName === 'execute') {
								const [dest, value, func] = innerDecoded.args as [
									Hex,
									bigint,
									Hex,
								];

								if (verbose) {
									log(`   Execute → ${dest}`);
									log(`   Value: ${formatEther(value)} ETH`);
								}

								if (func && func !== '0x') {
									try {
										const innerFunc = decodeFunctionData({
											abi: ERC20_ABI,
											data: func,
										});
										const innerArgs = innerFunc.args as unknown[];

										if (verbose) {
											const fmt = (a: unknown) =>
												typeof a === 'bigint' ? a.toString() : String(a);
											log(
												`   Inner call: ${innerFunc.functionName}(${innerArgs.map(fmt).join(', ')})`,
											);
										}

										if (
											innerFunc.functionName === 'transfer' ||
											innerFunc.functionName === 'transferFrom'
										) {
											const [from, , amount] =
												innerFunc.functionName === 'transferFrom'
													? (innerArgs as [Hex, Hex, bigint])
													: ([op.sender, innerArgs[0], innerArgs[1]] as [
															Hex,
															Hex,
															bigint,
														]);
											summary = {
												amount: formatTokenAmount(dest, amount),
												from,
												beneficiary,
											};
										}
									} catch {
										if (verbose) {
											log(`   Inner call: ${func.slice(0, 10)}...`);
										}
									}
								}
							} else if (innerDecoded.functionName === 'executeBatch' && verbose) {
								const [dests, values, funcs] = innerDecoded.args as [
									readonly Hex[],
									readonly bigint[],
									readonly Hex[],
								];
								log(`   ExecuteBatch: ${dests.length} calls`);
								for (let j = 0; j < dests.length; j++) {
									log(
										`     [${j}] → ${dests[j]}, ${formatEther(values[j])} ETH`,
									);
									if (funcs[j] && funcs[j] !== '0x') {
										log(`         ${tryDecodeInnerCall(funcs[j])}`);
									}
								}
							}
						} catch {
							if (verbose) {
								log(`   Call data: ${op.callData.slice(0, 20)}...`);
							}
						}
					}
				}

				return {
					success: true,
					summary: summary
						? {
								amount: summary.amount,
								from: summary.from,
								beneficiary: summary.beneficiary,
							}
						: undefined,
					verboseOutput: verbose ? lines.join('\n') : undefined,
				};
			}
		}

		return {
			success: false,
			error: 'Could not decode transaction (not an AA handleOps).',
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, error: message };
	}
}
