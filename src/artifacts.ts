import * as fs from 'fs';
import * as path from 'path';
import { keccak256, toBytes } from 'viem';
import type { Abi } from 'viem';

const ERC20_ABI: Abi = [
	{
		name: 'transfer',
		type: 'function',
		inputs: [
			{ name: 'to', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
		outputs: [],
		stateMutability: 'nonpayable',
	},
	{
		name: 'transferFrom',
		type: 'function',
		inputs: [
			{ name: 'from', type: 'address' },
			{ name: 'to', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
		outputs: [],
		stateMutability: 'nonpayable',
	},
	{
		name: 'approve',
		type: 'function',
		inputs: [
			{ name: 'spender', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
		outputs: [],
		stateMutability: 'nonpayable',
	},
];

const SIMPLE_ACCOUNT_EXECUTE_ABI: Abi = [
	{
		name: 'execute',
		type: 'function',
		inputs: [
			{ name: 'dest', type: 'address' },
			{ name: 'value', type: 'uint256' },
			{ name: 'func', type: 'bytes' },
		],
		outputs: [],
		stateMutability: 'nonpayable',
	},
	{
		name: 'executeBatch',
		type: 'function',
		inputs: [
			{ name: 'dest', type: 'address[]' },
			{ name: 'value', type: 'uint256[]' },
			{ name: 'func', type: 'bytes[]' },
		],
		outputs: [],
		stateMutability: 'nonpayable',
	},
];

/** Common factory/deploy patterns (selector 0x00774360 = deploy(bytes)) */
const COMMON_DEPLOY_ABI: Abi = [
	{
		name: 'deploy',
		type: 'function',
		inputs: [{ name: 'initCode', type: 'bytes' }],
		outputs: [],
		stateMutability: 'nonpayable',
	},
];

/** KAMI721C mint (selector 0x1169051d) - always available so mint decodes even if artifacts miss */
const KAMI_MINT_ABI: Abi = [
	{
		name: 'mintFor',
		type: 'function',
		inputs: [
			{ name: 'recipient', type: 'address' },
			{ name: 'tokenPrice', type: 'uint256' },
			{ name: 'uri', type: 'string' },
			{
				name: 'mintRoyalties',
				type: 'tuple[]',
				components: [
					{ name: 'receiver', type: 'address' },
					{ name: 'feeNumerator', type: 'uint96' },
				],
			},
		],
		outputs: [],
		stateMutability: 'nonpayable',
	},
];

const FALLBACK_ABI: Abi = [
	...SIMPLE_ACCOUNT_EXECUTE_ABI,
	...ERC20_ABI,
	...COMMON_DEPLOY_ABI,
	...KAMI_MINT_ABI,
];

interface ArtifactJson {
	abi?: Array<{ type?: string; name?: string; inputs?: unknown[] }>;
	methodIdentifiers?: Record<string, string>;
	bytecode?: { object?: string };
	deployedBytecode?: { object?: string };
}

type AbiParam = { type?: string; components?: AbiParam[] };

/** Expand ABI type to canonical form for selector (e.g. tuple[] -> (address,uint96)[]) */
function expandAbiType(p: AbiParam): string {
	const t = p.type ?? '';
	if (t.startsWith('tuple')) {
		const comps = p.components ?? [];
		const inner = comps.map((c) => expandAbiType(c)).join(',');
		const suffix = t.replace('tuple', '');
		return `(${inner})${suffix}`;
	}
	return t;
}

function getSelectorFromAbiItem(item: { name?: string; inputs?: unknown[] }): string {
	const params = (item.inputs as AbiParam[]) ?? [];
	const expanded = params.map((p) => expandAbiType(p)).join(',');
	const sig = `${item.name}(${expanded})`;
	const hash = keccak256(toBytes(sig));
	return hash.slice(0, 10);
}

export function getArtifactsDir(): string {
	const candidates: string[] = [];
	if (typeof __dirname !== 'undefined') {
		candidates.push(path.join(__dirname, 'artifacts'));
		candidates.push(path.join(__dirname, '..', 'artifacts'));
	}
	try {
		const { app } = require('electron');
		if (app?.getAppPath) {
			candidates.push(path.join(app.getAppPath(), 'dist', 'artifacts'));
			candidates.push(path.join(app.getAppPath(), 'artifacts'));
		}
	} catch {
		// not in Electron
	}
	candidates.push(path.join(process.cwd(), 'artifacts'));
	for (const dir of candidates) {
		if (fs.existsSync(dir)) return dir;
	}
	return path.join(process.cwd(), 'artifacts');
}

function loadMergedAbiFromArtifacts(): Abi {
	const artifactsDir = getArtifactsDir();
	if (!fs.existsSync(artifactsDir)) {
		return [...FALLBACK_ABI];
	}

	const seen = new Map<string, Abi[number]>();
	type AbiFunctionLike = { name?: string; inputs?: unknown[]; type?: string };

	function addItem(item: AbiFunctionLike) {
		if (item.type !== 'function' || !item.name) return;
		const selector = getSelectorFromAbiItem(item);
		if (seen.has(selector)) return;
		seen.set(selector, { ...item, type: 'function' } as unknown as Abi[number]);
	}

	for (const abiItem of FALLBACK_ABI) {
		addItem(abiItem as unknown as AbiFunctionLike);
	}

	const jsonFiles = findArtifactJsonFiles(artifactsDir);
	for (const filePath of jsonFiles) {
		try {
			const content = fs.readFileSync(filePath, 'utf-8');
			const artifact: ArtifactJson = JSON.parse(content);
			const abi = artifact.abi ?? [];
			const methodIds = artifact.methodIdentifiers ?? {};
			for (const item of abi) {
				if (item.type !== 'function' || !item.name) continue;
				// Prefer methodIdentifiers (exact) over computed selector for complex types
				const computedSig = `${item.name}(${(item.inputs as AbiParam[])?.map((p) => expandAbiType(p)).join(',') ?? ''})`;
				const selectorFromIds = methodIds[computedSig]
					? `0x${methodIds[computedSig]}`
					: null;
				const selector = selectorFromIds ?? getSelectorFromAbiItem(item);
				if (seen.has(selector)) continue;
				const full = item as Record<string, unknown>;
				seen.set(selector, {
					name: item.name,
					inputs: item.inputs ?? [],
					outputs: full.outputs ?? [],
					stateMutability: (full.stateMutability as string) ?? 'nonpayable',
					type: 'function',
				} as unknown as Abi[number]);
			}
		} catch {
			// skip invalid files
		}
	}

	return Array.from(seen.values()) as Abi;
}

function findArtifactJsonFiles(dir: string): string[] {
	const results: string[] = [];
	function walk(d: string) {
		if (!fs.existsSync(d)) return;
		const entries = fs.readdirSync(d, { withFileTypes: true });
		for (const e of entries) {
			const full = path.join(d, e.name);
			if (e.isDirectory()) {
				walk(full);
			} else if (e.isFile() && e.name.endsWith('.json') && !e.name.endsWith('.dbg.json')) {
				results.push(full);
			}
		}
	}
	walk(dir);
	return results;
}

/** Bytecode signature length (hex chars) used to match initCode to known contracts */
const BYTECODE_SIGNATURE_LEN = 256;
/** Shorter prefix for substring search when exact start doesn't match (e.g. different compiler prefix) */
const BYTECODE_SHORT_PREFIX_LEN = 64;
/** Max hex chars to search for substring match (creation code embeds runtime; search first 8KB) */
const SEARCH_RANGE_HEX = 16384;

let cachedBytecodeSignatures: { name: string; prefixHex: string; shortPrefixHex: string }[] | null = null;

function loadBytecodeSignatures(): { name: string; prefixHex: string; shortPrefixHex: string }[] {
	if (cachedBytecodeSignatures !== null) return cachedBytecodeSignatures;
	const dir = getArtifactsDir();
	const out: { name: string; prefixHex: string; shortPrefixHex: string }[] = [];
	for (const filePath of findArtifactJsonFiles(dir)) {
		try {
			const content = fs.readFileSync(filePath, 'utf-8');
			const artifact = JSON.parse(content) as ArtifactJson;
			const name = path.basename(path.dirname(filePath)).replace(/\.sol$/, '') || path.basename(filePath, '.json');
			// Creation bytecode (deployment bytecode)
			const bc = artifact.bytecode?.object;
			if (bc && typeof bc === 'string') {
				const hex = bc.startsWith('0x') ? bc.slice(2) : bc;
				if (hex.length >= BYTECODE_SIGNATURE_LEN) {
					out.push({
						name,
						prefixHex: hex.slice(0, BYTECODE_SIGNATURE_LEN),
						shortPrefixHex: hex.slice(0, BYTECODE_SHORT_PREFIX_LEN),
					});
				}
			}
			// Deployed (runtime) bytecode – creation code embeds this, so initCode may match here when creation prefix differs (e.g. linker)
			const rt = artifact.deployedBytecode?.object;
			if (rt && typeof rt === 'string') {
				const hex = rt.startsWith('0x') ? rt.slice(2) : rt;
				if (hex.length >= BYTECODE_SHORT_PREFIX_LEN) {
					const shortPrefixHex = hex.slice(0, BYTECODE_SHORT_PREFIX_LEN);
					out.push({
						name,
						prefixHex: hex.length >= BYTECODE_SIGNATURE_LEN ? hex.slice(0, BYTECODE_SIGNATURE_LEN) : shortPrefixHex,
						shortPrefixHex,
					});
				}
			}
		} catch {
			// skip
		}
	}
	cachedBytecodeSignatures = out;
	return out;
}

/**
 * If initCode contains creation code matching a known artifact, return the contract name (e.g. "KAMI721C").
 * Handles: raw creation code; factory (20 bytes) + creation code; or factory + ABI-encoded bytes.
 * First tries exact prefix match at known offsets; then searches for artifact bytecode anywhere in the first 1KB.
 */
export function getContractNameFromInitCode(initCode: string): string | undefined {
	const raw = initCode.startsWith('0x') ? initCode.slice(2) : initCode;
	if (raw.length < BYTECODE_SHORT_PREFIX_LEN) return undefined;
	const signatures = loadBytecodeSignatures();
	// Offsets (in hex chars): 0 = direct; 40 = after 20-byte factory; 104 = factory + length; 168 = factory + ABI offset + length
	const offsets = [0, 40, 104, 168];
	const candidates = offsets
		.filter((off) => raw.length > off)
		.map((off) => (off === 0 ? raw : raw.slice(off)));
	// 1) Exact prefix match at known offsets
	for (const creationCode of candidates) {
		if (creationCode.length < BYTECODE_SIGNATURE_LEN) continue;
		for (const { name, prefixHex } of signatures) {
			if (creationCode.startsWith(prefixHex)) return name;
		}
	}
	// 2) Substring match in first 1KB (handles different compiler/metadata prefix)
	const searchRange = raw.length > SEARCH_RANGE_HEX ? raw.slice(0, SEARCH_RANGE_HEX) : raw;
	for (const { name, shortPrefixHex } of signatures) {
		if (searchRange.includes(shortPrefixHex)) return name;
	}
	// Also try substring in each candidate (after factory offsets)
	for (const creationCode of candidates) {
		const range = creationCode.length > SEARCH_RANGE_HEX ? creationCode.slice(0, SEARCH_RANGE_HEX) : creationCode;
		for (const { name, shortPrefixHex } of signatures) {
			if (range.includes(shortPrefixHex)) return name;
		}
	}
	return undefined;
}

let cachedAbi: Abi | null = null;

const FALLBACK_FUNCTION_COUNT = FALLBACK_ABI.filter((x) => x.type === 'function').length;

export function getMergedAbi(): Abi {
	const loaded = loadMergedAbiFromArtifacts();
	const fnCount = loaded.filter((x) => x.type === 'function').length;
	// Only cache when we got a real artifact merge; never cache fallback-only so next decode can retry
	if (fnCount > FALLBACK_FUNCTION_COUNT) {
		cachedAbi = loaded;
	}
	return cachedAbi ?? loaded;
}

/** Fallback ABI only (execute, ERC20, deploy, mintFor) - use when merged decode fails */
export function getFallbackAbi(): Abi {
	return [...FALLBACK_ABI];
}
