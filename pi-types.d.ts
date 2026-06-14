declare module "@earendil-works/pi-coding-agent" {
	export interface ExtensionAPI {
		on(event: string, handler: (...args: any[]) => any): void;
		registerCommand(name: string, command: any): void;
		sendUserMessage(msg: string, opts?: any): void;
	}
}
