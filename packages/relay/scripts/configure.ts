#!/usr/bin/env bun
/**
 * configure.ts - Idempotent relay configuration/deploy script.
 *
 * Run on the Pi to apply code and config updates:
 *   sudo bun run packages/relay/scripts/configure.ts
 *
 * Safe to re-run at any time. Called by:
 *   - GitHub Actions deploy workflow (on push to main)
 *   - Operator manually via Tailscale SSH
 */

const RELAY_DIR = '/opt/river-relay';
const SYSTEMD_DIR = '/etc/systemd/system';
const CONFIG_DIR = `${RELAY_DIR}/packages/relay/config`;

const UNITS = [
	'river-relay.service',
	'river-relay-reset.timer',
	'river-relay-reset.service'
] as const;

function run(cmd: string[], opts?: { cwd?: string }) {
	const result = Bun.spawnSync(cmd, {
		cwd: opts?.cwd ?? RELAY_DIR,
		stdout: 'inherit',
		stderr: 'inherit'
	});
	return result.success;
}

function log(msg: string) {
	console.log(`[configure] ${msg}`);
}

if (process.getuid?.() !== 0) {
	console.error('ERROR: configure.ts must be run as root (use sudo)');
	process.exit(1);
}

if (!(await Bun.file(`${RELAY_DIR}/.env`).exists())) {
	console.error('ERROR: /opt/river-relay/.env not found. Run setup.sh first.');
	process.exit(1);
}

log('Pulling latest code...');
if (!run(['git', 'pull', '--ff-only'])) {
	console.error('ERROR: git pull failed (merge conflict or network issue)');
	process.exit(1);
}

const previousLock = Bun.spawnSync(['git', 'rev-parse', 'HEAD@{1}'], {
	cwd: RELAY_DIR,
	stdout: 'pipe',
	stderr: 'ignore'
});
const previousRef = new TextDecoder().decode(previousLock.stdout).trim();
const lockChanged = previousRef
	? run(['git', 'diff', '--quiet', `${previousRef}..HEAD`, '--', 'bun.lock']) === false
	: true;

if (lockChanged) {
	log('bun.lock changed, installing dependencies...');
	if (!run(['bun', 'install', '--frozen-lockfile'])) {
		log('Retrying bun install without --frozen-lockfile...');
		if (!run(['bun', 'install'])) {
			console.error('ERROR: bun install failed');
			process.exit(1);
		}
	}
} else {
	log('bun.lock unchanged, skipping bun install');
}

let unitsChanged = false;

for (const unit of UNITS) {
	const src = `${CONFIG_DIR}/${unit}`;
	const dst = `${SYSTEMD_DIR}/${unit}`;

	const srcFile = Bun.file(src);
	const dstFile = Bun.file(dst);

	if (!(await srcFile.exists())) {
		console.error(`ERROR: ${src} not found`);
		process.exit(1);
	}

	const srcContent = await srcFile.text();
	const dstContent = (await dstFile.exists()) ? await dstFile.text() : '';

	if (srcContent !== dstContent) {
		log(`Updating ${unit}...`);
		await Bun.write(dst, srcContent);
		unitsChanged = true;
	} else {
		log(`${unit} unchanged, skipping`);
	}
}

if (unitsChanged) {
	log('Reloading systemd daemon...');
	run(['systemctl', 'daemon-reload']);
}

log('Restarting river-relay service...');
if (!run(['systemctl', 'restart', 'river-relay.service'])) {
	console.error('ERROR: service restart failed. Rolling back to previous commit...');
	run(['git', 'reset', '--hard', 'HEAD@{1}']);
	run(['systemctl', 'restart', 'river-relay.service']);
	process.exit(1);
}

run(['systemctl', 'enable', 'river-relay-reset.timer']);
run(['systemctl', 'start', 'river-relay-reset.timer']);

log('Verifying service status...');
const status = Bun.spawnSync(['systemctl', 'is-active', 'river-relay.service'], {
	stdout: 'pipe'
});
const state = new TextDecoder().decode(status.stdout).trim();

if (state === 'active' || state === 'activating') {
	log(`Service is ${state} ✓`);
} else {
	log(`WARNING: Service state is '${state}' - check: journalctl -u river-relay -n 50`);
}

const health = Bun.spawnSync(['curl', '-fsS', '--max-time', '3', 'http://127.0.0.1:9090/health'], {
	stdout: 'pipe',
	stderr: 'pipe'
});
if (health.success) {
	log('Health endpoint check passed ✓');
} else {
	log('WARNING: /health check failed (service may still be warming up or health disabled)');
}

log('Configure complete');
