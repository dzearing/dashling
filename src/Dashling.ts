import Settings from './Settings';
import StreamController from './StreamController';
import { DashlingEvent, DashlingSessionState, DashlingRequestState, DashlingError } from './DashlingEnums';
import Manifest from './Manifest';
import ManifestParser from './ManifestParser';
import EventGroup from './EventGroup';
import IStateChangeEventArgs from './IStateChangeEventArgs';

let _sessionCount = 0;

export default class Dashling {
  /** Exported enums for simplifying access externally. */
  public Event = DashlingEvent;
  public SessionState = DashlingSessionState;
  public RequestState = DashlingRequestState;

  public state: DashlingSessionState;
  public lastError: string;
  public startTime: number;
  public isDisposed: boolean;
  public timeAtFirstCanPlay: number;
  public settings: Settings;

  private _events: EventGroup;
  private _streamController: StreamController;
  private _parser: ManifestParser;
  private _sessionIndex: number;
  private _videoElement: HTMLVideoElement;
  private _mediaSource: MediaSource;

  constructor(settings: Settings) {
    this.isDisposed = false;
    this._events = new EventGroup(this);
    this.settings = settings || new Settings();
    this.reset();
  }

  /** Disposes dashling. */
  public dispose() {
    if (!this.isDisposed) {
      this.isDisposed = true;
      this._events.dispose();
      this.reset();
    }
  }

  /** Add/remove eventlistener stubs for backwards compatibility. */
  public addEventListener(eventName: string, callback: (...args: any[]) => any) {
    this._events.on(this, eventName, callback);
  }

  public removeEventListener(eventName: string, callback: (...args: any[]) => any) {
    this._events.off(this, eventName, callback);
  }

  /** Loads a given video. */
  public load(videoElement: HTMLVideoElement, url: string) {
    this.reset();

    this._sessionIndex = ++_sessionCount;

    this.startTime = new Date().getTime();
    this._setState(DashlingSessionState.initializing);
    this._videoElement = videoElement;

    this._initializeMediaSource(videoElement);
    this._initializeManifest(url);
  }

  /** Resets the dashling state. */
  public reset() {
    this.timeAtFirstCanPlay = null;
    this.startTime = null;
    this.lastError = null;

    if (this._streamController) {
      this._streamController.dispose();
      this._streamController = null;
    }

    if (this._parser) {
      this._parser.dispose();
      this._parser = null;
    }

    if (this._videoElement) {
      this.settings.manifest = null;

      try {
        this._videoElement.pause();
      } catch (e) {}

      this._videoElement = null;
    }

    this._mediaSource = null;
    this._setState(DashlingSessionState.idle);
  }

  public getRemainingBuffer() {
    return this._streamController ? this._streamController.getRemainingBuffer() : 0;
  }

  public getBufferRate() {
    return this._streamController ? this._streamController.getBufferRate() : 0;
  }

  public getPlayingQuality(streamType: string): number {
    return this._streamController ? this._streamController.getPlayingQuality(streamType) : this.settings.targetQuality[streamType];
  }

  public getBufferingQuality(streamType: string): number {
    return this._streamController ? this._streamController.getBufferingQuality(streamType) : this.settings.targetQuality[streamType];
  }

  public getMaxQuality(streamType: string): number {
    let stream = this.settings.manifest ? this.settings.manifest.streams[streamType] : null;

    return stream ? stream.qualities.length - 1 : 0;
  }

  private _setState(state: DashlingSessionState, errorType?: string, errorMessage?: string) {
    if (!this.isDisposed && this.state !== state) {
      this.state = state;
      this.lastError = errorType ? (errorType + " " + (errorMessage ? "(" + errorMessage + ")" : "")) : null;

      // Stop stream controller immediately.
      if (state === DashlingSessionState.error && this._streamController) {
        this._streamController.dispose();
      }

      if (!this.timeAtFirstCanPlay && (state == DashlingSessionState.playing || state == DashlingSessionState.paused)) {
        this.timeAtFirstCanPlay = new Date().getTime() - this.startTime;
      }

      this._events.raise(
        DashlingEvent.sessionStateChange,
        {
          state: state,
          errorType: errorType,
          errorMessage: errorMessage
        });
    }
  }

  private _initializeMediaSource(videoElement: HTMLVideoElement) {
    let _this = this;
    let sessionIndex = _this._sessionIndex;
    let mediaSource: MediaSource;

    try {
      mediaSource = new MediaSource();
    } catch (e) {
      _this._setState(DashlingSessionState.error, DashlingError.mediaSourceInit);
    }

    if (mediaSource) {
      mediaSource.addEventListener("sourceopen", _onOpened, false);
      videoElement.src = URL.createObjectURL(mediaSource);
    }

    function _onOpened() {
      mediaSource.removeEventListener("sourceopen", _onOpened);

      if (_this._sessionIndex === sessionIndex) {
        _this._mediaSource = mediaSource;
        _this._tryStart();
      }
    }
  }

  private _initializeManifest(url: string) {
    let sessionIndex = this._sessionIndex;

    let onParserSuccess = (manifest: Manifest) => {
      if (this._sessionIndex === sessionIndex && this.state !== DashlingSessionState.error) {
        this.settings.manifest = manifest;
        this._tryStart();
      }
    };

    let onParserError = (errorType: string, errorMessage: string) => {
      if (this._sessionIndex === sessionIndex) {
        this._setState(DashlingSessionState.error, errorType, errorMessage);
      }
    };

    if (this.settings.manifest) {
      onParserSuccess(this.settings.manifest);
    } else {
      let parser = this._parser = new ManifestParser(this.settings);

      parser.parse(url, onParserSuccess, onParserError);
    }
  }

  private _tryStart() {
    if (
      this.state !== DashlingSessionState.error &&
      this._mediaSource &&
      this.settings.manifest
    ) {

      this._mediaSource.duration = this.settings.manifest.mediaDuration;

      this._streamController = new StreamController(
        this._videoElement,
        this._mediaSource,
        this.settings);

      // TODO forward download events from steamcontroller out?

      this._events.on(this._streamController, DashlingEvent.sessionStateChange, (ev: IStateChangeEventArgs) => {
        this._setState(ev.state, ev.errorType, ev.errorMessage);
      });

      this._streamController.start();
    }
  }

}

