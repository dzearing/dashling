export default class Async {
    private _parent;
    private _isDisposed;
    private _throttleIds;
    private _timeoutIds;
    constructor(parent: any);
    dispose(): void;
    setTimeout(func: () => any, delay: number): number;
    clearTimeout(timeoutId: number): void;
    clearAllTimeouts(): void;
    throttle(func: () => any, id: string, minTime: number, shouldReset: boolean, shouldCallImmediately: boolean): void;
    clearThrottle(id: string): void;
    clearAllThrottles(): void;
}
