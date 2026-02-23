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
import { getMergedAbi, getFallbackAbi, getArtifactsDir, getContractNameFromInitCode } from './artifacts';

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

export interface CallSummary {
	function: string;
	target: string;
	args: Record<string, string>;
}

export interface DecodeResult {
	success: boolean;
	calls?: CallSummary[];
	summary?: { amount: string; from: string; beneficiary: string };
	verboseOutput?: string;
	/** Set when at least one call was decoded; used for verbose ABI line */
	abiUsed?: { source: 'merged' | 'fallback'; functionCount: number };
	/** Gas used (decimal string) when receipt is available */
	gasUsed?: string;
	/** Gas price in Gwei (e.g. "0.05") when available */
	gasPriceGwei?: string;
	error?: string;
}

function formatArg(value: unknown): string {
	if (value === null) return 'null';
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'string' && value.startsWith('0x')) {
		// Truncate long bytes (e.g. deploy initCode) for readability
		if (value.length > 74) {
			const bytes = (value.length - 2) / 2;
			return `${value.slice(0, 12)}...${value.slice(-4)} (${bytes} bytes)`;
		}
		return value;
	}
	if (typeof value === 'object') {
		if (Array.isArray(value)) {
			return '[' + value.map(formatArg).join(', ') + ']';
		}
		// Recursively format so nested BigInts are stringified (JSON.stringify throws on BigInt)
		const entries = Object.entries(value as Record<string, unknown>).map(
			([k, v]) => `${k}: ${formatArg(v)}`,
		);
		return '{' + entries.join(', ') + '}';
	}
	return String(value);
}

function formatAbiUsedLine(abiUsed: { source: 'merged' | 'fallback'; functionCount: number }): string {
	return abiUsed.source === 'merged'
		? `ABI: merged (${abiUsed.functionCount} functions)`
		: `ABI: fallback only (${abiUsed.functionCount} functions)`;
}

/** Show deploy as "deploy (ContractName)" when contractKind is set (from raw initCode match) */
function displayFunctionForCall(
	fn: string,
	_args: Record<string, string>,
	contractKind?: string,
): string {
	if (fn === 'deploy' && contractKind) return `deploy (${contractKind})`;
	return fn;
}

function withVerboseHeader(
	content: string,
	abiUsed?: { source: 'merged' | 'fallback'; functionCount: number },
): string {
	const header =
		'Artifacts dir: ' +
		getArtifactsDir() +
		(abiUsed ? '\n' + formatAbiUsedLine(abiUsed) : '');
	return content ? header + '\n' + content : header;
}

function tryDecodeInnerCall(data: Hex): string {
	try {
		const decoded = decodeFunctionData({
			abi: getMergedAbi(),
			data,
		});
		const args = decoded.args as unknown[];
		const argsStr = args.map(formatArg).join(', ');
		return `${decoded.functionName}(${argsStr})`;
	} catch {
		return data.slice(0, 10) + '... (unknown)';
	}
}

function decodeWithAbi(
	abi: ReturnType<typeof getMergedAbi>,
	data: Hex,
): { function: string; args: Record<string, string>; contractKind?: string } | { error: string } {
	try {
		const decoded = decodeFunctionData({ abi, data });
		const args = decoded.args;
		const argsRecord: Record<string, string> = {};
		if (Array.isArray(args)) {
			const fn = (
				abi as unknown as Array<{ type?: string; name?: string; inputs?: Array<{ name?: string }> }>
			).find(
				(x) => x.type === 'function' && x.name === decoded.functionName,
			);
			const inputs = fn?.inputs ?? [];
			for (let i = 0; i < args.length; i++) {
				const name = inputs[i]?.name ?? `arg${i}`;
				argsRecord[name] = formatArg(args[i]);
			}
		} else if (typeof args === 'object' && args !== null) {
			for (const [k, v] of Object.entries(args)) {
				argsRecord[k] = formatArg(v);
			}
		}
		let contractKind: string | undefined;
		if (decoded.functionName === 'deploy') {
			const rawInitCode = Array.isArray(args)
				? args[0]
				: typeof args === 'object' && args !== null
					? (args as unknown as Record<string, unknown>).initCode
					: undefined;
			if (typeof rawInitCode === 'string') {
				contractKind = getContractNameFromInitCode(rawInitCode);
			}
		}
		return {
			function: decoded.functionName,
			args: argsRecord,
			...(contractKind ? { contractKind } : {}),
		};
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return { error: message };
	}
}

function decodeToCallSummary(
	_target: Hex,
	data: Hex,
	opts?: { onDecodeError?: (err: string) => void },
): {
	function: string;
	args: Record<string, string>;
	abiSource?: 'merged' | 'fallback';
	abiFunctionCount?: number;
	contractKind?: string;
} | null {
	const merged = getMergedAbi();
	const mergedResult = decodeWithAbi(merged, data);
	if (!('error' in mergedResult)) {
		return {
			...mergedResult,
			abiSource: 'merged',
			abiFunctionCount: merged.filter((x) => x.type === 'function').length,
		};
	}
	const fallback = getFallbackAbi();
	const fallbackResult = decodeWithAbi(fallback, data);
	if (!('error' in fallbackResult)) {
		return {
			...fallbackResult,
			abiSource: 'fallback',
			abiFunctionCount: fallback.filter((x) => x.type === 'function').length,
		};
	}
	opts?.onDecodeError?.(fallbackResult.error);
	return null;
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
		const [tx, receipt] = await Promise.all([
			client.getTransaction({ hash }),
			client.getTransactionReceipt({ hash }).catch(() => null),
		]);

		const gasUsed = receipt?.gasUsed != null ? String(receipt.gasUsed) : undefined;
		const gasPriceGwei =
			receipt?.effectiveGasPrice != null
				? formatUnits(receipt.effectiveGasPrice, 9)
				: tx?.gasPrice != null
					? formatUnits(tx.gasPrice, 9)
					: undefined;

		function prependGasLine(verboseText: string): string {
			if (!gasUsed && !gasPriceGwei) return verboseText;
			const parts: string[] = [];
			if (gasUsed) parts.push(`Gas used: ${gasUsed}`);
			if (gasPriceGwei) parts.push(`Gas price: ${gasPriceGwei} Gwei`);
			return parts.join(' | ') + '\n' + verboseText;
		}

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

				const calls: CallSummary[] = [];
				let summary: {
					amount: string;
					from: Hex;
					beneficiary: Hex;
				} | null = null;
				let abiUsed: { source: 'merged' | 'fallback'; functionCount: number } | undefined;

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
									const decoded = decodeToCallSummary(dest, func);
									if (decoded) {
										if (!abiUsed && decoded.abiSource)
											abiUsed = {
												source: decoded.abiSource,
												functionCount: decoded.abiFunctionCount ?? 0,
											};
										calls.push({
											function: displayFunctionForCall(decoded.function, decoded.args, decoded.contractKind),
											target: dest,
											args: decoded.args,
										});
										if (verbose) {
											const argsStr = Object.entries(decoded.args)
												.map(([k, v]) => `${k}=${v}`)
												.join(', ');
											log(`   Inner call: ${decoded.function}(${argsStr})`);
										}
										if (
											decoded.function === 'transfer' ||
											decoded.function === 'transferFrom'
										) {
											const to = decoded.args.to ?? decoded.args['to'];
											const amount = decoded.args.amount ?? decoded.args['amount'];
											const from =
												decoded.function === 'transferFrom'
													? (decoded.args.from ?? decoded.args['from'])
													: op.sender;
											if (to && amount) {
												summary = {
													amount: formatTokenAmount(dest, BigInt(amount)),
													from: from as Hex,
													beneficiary,
												};
											}
										}
									} else {
										if (verbose) {
											log(`   Inner call: ${func.slice(0, 10)}... (unknown)`);
										}
										calls.push({
											function: `${func.slice(0, 10)}... (unknown)`,
											target: dest,
											args: {},
										});
									}
								}
							} else if (innerDecoded.functionName === 'executeBatch') {
								const [dests, values, funcs] = innerDecoded.args as [
									readonly Hex[],
									readonly bigint[],
									readonly Hex[],
								];
								if (verbose) {
									log(`   ExecuteBatch: ${dests.length} calls`);
								}
								for (let j = 0; j < dests.length; j++) {
									const dest = dests[j];
									const func = funcs[j];
									if (verbose) {
										log(
											`     [${j}] → ${dest}, ${formatEther(values[j])} ETH`,
										);
									}
									if (func && func !== '0x') {
										const decoded = decodeToCallSummary(dest, func);
										if (decoded) {
											if (!abiUsed && decoded.abiSource)
												abiUsed = {
													source: decoded.abiSource,
													functionCount: decoded.abiFunctionCount ?? 0,
												};
											calls.push({
												function: displayFunctionForCall(decoded.function, decoded.args, decoded.contractKind),
												target: dest,
												args: decoded.args,
											});
											if (verbose) {
												log(`         ${decoded.function}(${Object.entries(decoded.args).map(([k, v]) => `${k}=${v}`).join(', ')})`);
											}
											if (
												!summary &&
												(decoded.function === 'transfer' ||
													decoded.function === 'transferFrom')
											) {
												const to = decoded.args.to ?? decoded.args['to'];
												const amount =
													decoded.args.amount ?? decoded.args['amount'];
												const from =
													decoded.function === 'transferFrom'
														? (decoded.args.from ?? decoded.args['from'])
														: op.sender;
												if (to && amount) {
													summary = {
														amount: formatTokenAmount(dest, BigInt(amount)),
														from: from as Hex,
														beneficiary,
													};
												}
											}
										} else {
											if (verbose) {
												log(`         ${tryDecodeInnerCall(func)}`);
											}
											calls.push({
												function: `${func.slice(0, 10)}... (unknown)`,
												target: dest,
												args: {},
											});
										}
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
					calls: calls.length > 0 ? calls : undefined,
					summary: summary
						? {
								amount: summary.amount,
								from: summary.from,
								beneficiary: summary.beneficiary,
							}
						: undefined,
					verboseOutput: verbose ? prependGasLine(withVerboseHeader(lines.join('\n'), abiUsed)) : undefined,
					abiUsed,
					gasUsed,
					gasPriceGwei,
				};
			}
		}

		// Direct transaction path: decode tx.input with merged ABI
		if (tx.to && tx.input && tx.input !== '0x') {
			// Check if it's execute/executeBatch (SimpleAccount-style) to decode inner calls
			try {
				const outerDecoded = decodeFunctionData({
					abi: SIMPLE_ACCOUNT_EXECUTE_ABI,
					data: tx.input,
				});
				if (outerDecoded.functionName === 'execute') {
					const [dest, _value, func] = outerDecoded.args as [Hex, bigint, Hex];
					if (func && func !== '0x') {
						let decodeError: string | undefined;
						const inner = decodeToCallSummary(dest, func, {
							onDecodeError: (err) => {
								decodeError = err;
							},
						});
						if (inner) {
							const abiUsed =
								inner.abiSource && inner.abiFunctionCount != null
									? { source: inner.abiSource, functionCount: inner.abiFunctionCount }
									: undefined;
							const innerDisplayFn = displayFunctionForCall(inner.function, inner.args, inner.contractKind);
							const calls: CallSummary[] = [{
								function: innerDisplayFn,
								target: dest,
								args: inner.args,
							}];
							let summary: { amount: string; from: Hex; beneficiary: Hex } | undefined;
							if (
								inner.function === 'transfer' ||
								inner.function === 'transferFrom'
							) {
								const to = inner.args.to ?? inner.args['to'];
								const amount = inner.args.amount ?? inner.args['amount'];
								const from =
									inner.function === 'transferFrom'
										? (inner.args.from ?? inner.args['from'])
										: tx.from ?? '';
								if (to && amount) {
									summary = {
										amount: formatTokenAmount(dest, BigInt(amount)),
										from: from as Hex,
										beneficiary: tx.from ?? ('' as Hex),
									};
								}
							}
							const verboseLines = `Direct execute to ${tx.to}\nInner: ${innerDisplayFn}\nTarget: ${dest}\nArgs: ${JSON.stringify(inner.args, null, 2)}`;
							return {
								success: true,
								calls,
								summary,
								verboseOutput: verbose ? prependGasLine(withVerboseHeader(verboseLines, abiUsed)) : undefined,
								abiUsed,
								gasUsed,
								gasPriceGwei,
							};
						}
						const merged = getMergedAbi();
						const abiUsedForUnknown: { source: 'merged' | 'fallback'; functionCount: number } = {
							source: 'merged',
							functionCount: merged.filter((x) => x.type === 'function').length,
						};
						if (abiUsedForUnknown.functionCount <= 7) abiUsedForUnknown.source = 'fallback';
						const unknownLines = [
							`Direct execute to ${tx.to}`,
							`Inner call: ${func.slice(0, 10)}... (unknown)`,
							...(decodeError ? [`Decode error: ${decodeError}`] : []),
						].join('\n');
						return {
							success: true,
							calls: [{
								function: `${func.slice(0, 10)}... (unknown)`,
								target: dest,
								args: {},
							}],
							verboseOutput: verbose ? prependGasLine(withVerboseHeader(unknownLines, abiUsedForUnknown)) : undefined,
							gasUsed,
							gasPriceGwei,
						};
					}
				} else if (outerDecoded.functionName === 'executeBatch') {
					const [dests, _values, funcs] = outerDecoded.args as [
						readonly Hex[],
						readonly bigint[],
						readonly Hex[],
					];
					const calls: CallSummary[] = [];
					let summary: { amount: string; from: Hex; beneficiary: Hex } | undefined;
					let abiUsed: { source: 'merged' | 'fallback'; functionCount: number } | undefined;
					for (let j = 0; j < dests.length; j++) {
						const dest = dests[j];
						const func = funcs[j];
						if (func && func !== '0x') {
							const inner = decodeToCallSummary(dest, func);
							if (inner) {
								if (!abiUsed && inner.abiSource)
									abiUsed = {
										source: inner.abiSource,
										functionCount: inner.abiFunctionCount ?? 0,
									};
								calls.push({ function: displayFunctionForCall(inner.function, inner.args, inner.contractKind), target: dest, args: inner.args });
								if (
									!summary &&
									(inner.function === 'transfer' || inner.function === 'transferFrom')
								) {
									const to = inner.args.to ?? inner.args['to'];
									const amount = inner.args.amount ?? inner.args['amount'];
									const from =
										inner.function === 'transferFrom'
											? (inner.args.from ?? inner.args['from'])
											: tx.from ?? '';
									if (to && amount) {
										summary = {
											amount: formatTokenAmount(dest, BigInt(amount)),
											from: from as Hex,
											beneficiary: tx.from ?? ('' as Hex),
										};
									}
								}
							} else {
								calls.push({
									function: `${func.slice(0, 10)}... (unknown)`,
									target: dest,
									args: {},
								});
							}
						}
					}
					if (calls.length > 0) {
						const verboseLines = `Direct executeBatch to ${tx.to}\n${calls.map((c) => `${c.function} → ${c.target}`).join('\n')}`;
						return {
							success: true,
							calls,
							summary,
							verboseOutput: verbose ? prependGasLine(withVerboseHeader(verboseLines, abiUsed)) : undefined,
							abiUsed,
							gasUsed,
							gasPriceGwei,
						};
					}
				}
			} catch {
				// Not execute/executeBatch, fall through to generic decode
			}

			// Generic direct call (not execute/executeBatch)
			const decoded = decodeToCallSummary(tx.to, tx.input);
			if (decoded) {
				const abiUsed =
					decoded.abiSource && decoded.abiFunctionCount != null
						? { source: decoded.abiSource, functionCount: decoded.abiFunctionCount }
						: undefined;
				const verboseLines = `Direct call to ${tx.to}\nFunction: ${decoded.function}\nArgs: ${JSON.stringify(decoded.args, null, 2)}`;
				return {
					success: true,
					calls: [{
						function: displayFunctionForCall(decoded.function, decoded.args, decoded.contractKind),
						target: tx.to,
						args: decoded.args,
					}],
					verboseOutput: verbose ? prependGasLine(withVerboseHeader(verboseLines, abiUsed)) : undefined,
					abiUsed,
					gasUsed,
					gasPriceGwei,
				};
			}
		}

		return {
			success: false,
			error: 'Could not decode transaction.',
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, error: message };
	}
}
