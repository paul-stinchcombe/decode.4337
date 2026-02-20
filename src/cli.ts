import { Command } from 'commander';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { decodeTransaction, parseChainId } from './decode';

dotenv.config();

const program = new Command();

program
	.version('1.0.0')
	.description('Decode Base Network Transactions')
	.option('-v, --verbose', 'Show full decode output')
	.option('-c, --chain <id>', 'Chain ID (hex or decimal, e.g. 0x2105 or 8453)', '8453')
	.argument('<hash>', 'Transaction hash to decode')
	.action(async (hash: string) => {
		const opts = program.opts();
		const verbose = opts.verbose ?? false;

		try {
			const chainId = parseChainId(opts.chain);
			const rpcUrl =
				chainId === 8453 ? process.env.BASE_RPC_URL : undefined;

			const result = await decodeTransaction(
				hash as `0x${string}`,
				chainId,
				verbose,
				rpcUrl,
			);

			if (!result.success) {
				console.error(chalk.red('\n❌ Error:'), result.error);
				return;
			}

			if (verbose && result.verboseOutput) {
				console.log(result.verboseOutput);
			}

			if (result.summary) {
				console.log(chalk.bold('\n📋 Summary'));
				console.log(chalk.bold('----------------------------------------'));
				console.log(`${chalk.cyan('Amount:')} ${result.summary.amount}`);
				console.log(`${chalk.cyan('From:')} ${result.summary.from}`);
				console.log(`${chalk.cyan('Beneficiary:')} ${result.summary.beneficiary}`);
				console.log(chalk.bold('----------------------------------------'));
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(chalk.red('\n❌ Error:'), message);
		}
	});

program.parse(process.argv);
