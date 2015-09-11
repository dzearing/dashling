export default class Storage {
    private _prefix: string;
    private _useSessionStorage: boolean;

    constructor(prefix: string, useSessionStorage?: boolean) {
        this._prefix = prefix || '';
        this._useSessionStorage = !!useSessionStorage;
    }

    public getItem(key: string, defaultValue?: string): string {
        let value = defaultValue;

        key = this._prefix + key;

        try {
            if (this._useSessionStorage) {
                value = window.sessionStorage.getItem(key);
            } else {
                value = window.localStorage.getItem(key);
            }
        } catch (e) { /* no-op */ }

        return value;
    }

    public setItem(key: string, value: string) {
        key = this._prefix + key;

        try {
            if (this._useSessionStorage) {
                window.sessionStorage.setItem(key, value);
            } else {
                window.localStorage.setItem(key, value);
            }
        } catch (e) { /* no-op */ }
    }
}
