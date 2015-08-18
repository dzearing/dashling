import Settings from './Settings';
import RequestManager from './RequestManager';
import Request from './Request';
import EventGroup from './EventGroup';
import { DashlingEvent, DashlingError } from './DashlingEnums';
import Manifest from './Manifest';

export default class ManifestParser {
  public static DownloadEvent = 'download';

  private _events: EventGroup;
  private _parseIndex: number;
  private _settings: Settings;
  private _requestManager: RequestManager;

  constructor(settings: Settings) {
    this._events = new EventGroup(this);
    this._parseIndex = 0;
    this._settings = settings;
    this._requestManager = new RequestManager(settings);

    this._events.on(this._requestManager, DashlingEvent.download, () => {
      this._events.raise(ManifestParser.DownloadEvent);
    });
  }

  public dispose() {
    if (this._requestManager) {
      this._requestManager.dispose();
      this._requestManager = null;
    }
  }

  public parse(url: string, onSuccess: (manifest: Manifest) => void, onError: (error: string, e: any) => void) {
    let parseIndex = ++this._parseIndex;
    let request: Request;

    let onParseSuccess = (request: Request) => {
      if (this._parseIndex === parseIndex) {
        let manifest = new Manifest(this._settings);

        try {
          manifest.parseFromRequest(request);
          onSuccess(manifest);
        } catch (e) {
          onError(DashlingError.manifestParse, e);
        }
      }
    };

    let onParseError = () => {
      if (this._parseIndex === parseIndex) {
        onError(DashlingError.manifestDownload, request.statusCode);
      }
    };

    request = new Request({
      url: url,
      requestType: 'manifest',
      onSuccess: onParseSuccess,
      onError: onParseError
    },
    this._settings);

    this._requestManager.start(request);
  }
}
