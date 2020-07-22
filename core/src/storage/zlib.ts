import zlib from "zlib";


export async function deflate(data: Buffer): Promise<Buffer> {
	return await new Promise((resolve, reject) => {
		zlib.deflate(data, (err, data) => {
			if(err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
}


export async function inflate(data: Buffer): Promise<Buffer> {
	return await new Promise((resolve, reject) => {
		zlib.inflate(data, (err, data) => {
			if(err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
}