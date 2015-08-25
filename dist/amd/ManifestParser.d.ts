import Settings from './Settings';
import Manifest from './Manifest';
export default class ManifestParser {
    static DownloadEvent: string;
    private _events;
    private _parseIndex;
    private _settings;
    private _requestManager;
    constructor(settings: Settings);
    dispose(): void;
    parse(url: string, onSuccess: (manifest: Manifest) => void, onError: (error: string, e: any) => void): void;
}
