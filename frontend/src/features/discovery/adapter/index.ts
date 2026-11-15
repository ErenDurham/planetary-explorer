import { HttpDiscoveryService } from "./httpService";
import type { DiscoveryService } from "./types";

let current: DiscoveryService = new HttpDiscoveryService();
/** The one service instance the UI talks to. */
export function discoveryService(): DiscoveryService { return current; }
/** Test-only injection point; production code never calls this. */
export function setDiscoveryService(service: DiscoveryService): void { current = service; }

export * from "./types";
export { isDiscoveryUnavailable, isDiscoveryNotFound, isDiscoveryRejected, isAbortError, translateDiscoveryError } from "./httpService";
