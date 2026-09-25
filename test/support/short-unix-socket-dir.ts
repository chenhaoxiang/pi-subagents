import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Leave one byte for the terminator in macOS's 104-byte sockaddr_un.sun_path.
const MAX_SOCKET_PATH_BYTES = 104;

/** Isolate fake Unix sockets without inheriting the test runner's long TMPDIR. */
export async function withShortUnixSocketDir<T>(prefix: string, socketNames: string[], run: (dir: string) => Promise<T>): Promise<T> {
	const preferredRoot = process.platform === "darwin" ? "/tmp" : os.tmpdir();
	const longestName = socketNames.reduce((longest, name) => Buffer.byteLength(name) > Buffer.byteLength(longest) ? name : longest, "");
	const candidate = path.join(preferredRoot, `${prefix}XXXXXX`, longestName);
	const root = Buffer.byteLength(candidate) < MAX_SOCKET_PATH_BYTES ? preferredRoot : "/tmp";
	const dir = fs.mkdtempSync(path.join(root, prefix));
	try {
		for (const name of socketNames) {
			const socketPath = path.join(dir, name);
			if (Buffer.byteLength(socketPath) >= MAX_SOCKET_PATH_BYTES) {
				throw new Error(`Test Unix socket path exceeds ${MAX_SOCKET_PATH_BYTES - 1} bytes: ${socketPath}`);
			}
		}
		return await run(dir);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}
