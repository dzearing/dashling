import Manifest from './Manifest';
export default class Settings {
    manifest: Manifest;
    startTime: number;
    isABREnabled: boolean;
    isRBREnabled: boolean;
    targetQuality: {
        [key: string]: number;
    };
    shouldAutoPlay: boolean;
    logToConsole: boolean;
    safeBufferSeconds: number;
    maxBufferSeconds: number;
    maxConcurrentRequests: {
        [key: string]: number;
    };
    maxSegmentLeadCount: {
        [key: string]: number;
    };
    defaultBandwidth: number;
    requestTimeout: number;
    maxRetries: number;
    delaysBetweenRetries: number[];
    requestCacheThreshold: number;
    baseUrlOverride: string;
}
