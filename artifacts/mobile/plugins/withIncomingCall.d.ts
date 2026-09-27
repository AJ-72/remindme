import type { ConfigPlugin } from "@expo/config-plugins";

declare const withIncomingCall: ConfigPlugin;
export default withIncomingCall;
export function addIncomingCallActivity(application: any): void;
