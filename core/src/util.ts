export async function sleep(time: number): Promise<void> {
	await new Promise(resolve => setTimeout(resolve, time));
}


export async function raceOrNull<T>(data: Promise<T>[]): Promise<T | null> {
	if(data.length === 0) {
		return null;
	} else {
		return await Promise.race(data);
	}
}