/**
 * Verifies that the merged ABI includes all expected contract functions.
 * Run after build: pnpm run build && node scripts/verify-abi.js
 */

const path = require('path');
const fs = require('fs');

// Run from project root; dist/artifacts must exist (build first)
const distPath = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(path.join(distPath, 'artifacts.js'))) {
	console.error('Run "pnpm run build" first so dist/artifacts.js exists.');
	process.exit(1);
}

const { getMergedAbi } = require(path.join(distPath, 'artifacts.js'));

const MIN_FUNCTION_COUNT = 100;
const REQUIRED_NAMES = ['setPrice', 'mintFor', 'setTokenURI', 'deploy', 'execute'];

const abi = getMergedAbi();
const functions = abi.filter((x) => x.type === 'function');
const names = new Set(functions.map((f) => f.name));

let failed = false;

if (functions.length < MIN_FUNCTION_COUNT) {
	console.error(
		`Expected at least ${MIN_FUNCTION_COUNT} functions in merged ABI, got ${functions.length}. Artifact loading may have failed.`,
	);
	failed = true;
} else {
	console.log(`Merged ABI has ${functions.length} functions (>= ${MIN_FUNCTION_COUNT}).`);
}

for (const name of REQUIRED_NAMES) {
	if (!names.has(name)) {
		console.error(`Missing required function in merged ABI: ${name}`);
		failed = true;
	} else {
		console.log(`  Has function: ${name}`);
	}
}

if (failed) {
	process.exit(1);
}
console.log('ABI verification passed.');
