export default class Storage {
    private _prefix;
    private _useSessionStorage;
    constructor(prefix: string, useSessionStorage?: boolean);
    getItem(key: string, defaultValue?: string): string;
    setItem(key: string, value: string): void;
}
