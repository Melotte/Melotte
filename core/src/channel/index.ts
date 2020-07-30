export default interface ChannelProtocol {
	on(topic: string, handler: (Buffer) => void): void;
	unsubscribe(topic: string): void;

	send(topic: string, message: Buffer): Promise<void>;
}