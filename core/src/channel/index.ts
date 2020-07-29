export default interface ChannelProtocol {
	destroy(): void;

	send(message: Buffer): Promise<void>;
}