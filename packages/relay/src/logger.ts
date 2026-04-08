const relayPrefix = '[relay]';

const formatMessage = (message: string) => `${relayPrefix} [${new Date().toISOString()}] ${message}`;

export const log = {
	info(message: string) {
		console.log(formatMessage(message));
	},
	warn(message: string) {
		console.warn(formatMessage(message));
	},
	error(message: string) {
		console.error(formatMessage(message));
	},
	debug(message: string) {
		console.debug(formatMessage(message));
	},
	state(from: string, to: string, reason: string) {
		console.log(formatMessage(`STATE: ${from} → ${to} (${reason})`));
	}
};
