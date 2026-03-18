import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(rootDir, 'static/stream');
const outputFile = resolve(outputDir, 'index.m3u8');
const rtspUrl = process.env.CAMERA_RTSP_URL;

if (!rtspUrl) {
	console.error('Missing CAMERA_RTSP_URL in your environment.');
	process.exit(1);
}

await mkdir(outputDir, { recursive: true });

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
		'copy',
		'-f',
		'hls',
		'-hls_time',
		'2',
		'-hls_list_size',
		'5',
		'-hls_flags',
		'delete_segments',
		outputFile
	],
	{
		stdio: ['inherit', 'inherit', 'inherit']
	}
);

process.exit(await ffmpeg.exited);
