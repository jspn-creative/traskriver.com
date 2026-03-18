const rtspUrl = process.env.CAMERA_RTSP_URL;
const liveInputKey = process.env.CF_STREAM_LIVE_INPUT_KEY;

if (!rtspUrl) {
	console.error('Missing CAMERA_RTSP_URL in your environment.');
	process.exit(1);
}

if (!liveInputKey) {
	console.error('Missing CF_STREAM_LIVE_INPUT_KEY in your environment.');
	process.exit(1);
}

const rtmpsUrl = `rtmps://live.cloudflare.com:443/live/${liveInputKey}`;

console.log(`Pushing RTSP stream to Cloudflare Stream...`);
console.log(`Source: ${rtspUrl}`);
console.log(`Destination: ${rtmpsUrl}`);

const ffmpeg = Bun.spawn(
	[
		'ffmpeg',
		'-rtsp_transport',
		'tcp',
		'-i',
		rtspUrl,
		'-c:v',
		'copy',
		'-c:a',
		'aac',
		'-f',
		'flv',
		rtmpsUrl
	],
	{
		stdio: ['inherit', 'inherit', 'inherit']
	}
);

process.exit(await ffmpeg.exited);
