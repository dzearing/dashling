import Settings from './Settings';
import StreamController from './StreamController';
import { DashlingEvent, DashlingSessionState, DashlingError } from './DashlingEnums';
import Manifest from './Manifest';
import ManifestParser from './ManifestParser';
import EventGroup from './EventGroup';
import IStateChangeEventArgs from './IStateChangeEventArgs';

let _sessionCount = 0;

export default class Dashling {
  public static SessionStateChangeEvent = 'sessionstatechange';

  public state: DashlingSessionState;
  public lastError: string;
  public startTime: number;
  public isDisposed: boolean;
  public timeAtFirstCanPlay: number;

  private _events: EventGroup;
  private _settings: Settings;
  private _streamController: StreamController;
  private _parser: ManifestParser;
  private _sessionIndex: number;
  private _videoElement: HTMLVideoElement;
  private _mediaSource: MediaSource;

  constructor(settings: Settings) {
    this.isDisposed = false;
    this._events = new EventGroup(this);
    this._settings = settings || new Settings();
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
      this._settings.manifest = null;

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
    return this._streamController ? this._streamController.getPlayingQuality(streamType) : this._settings.targetQuality[streamType];
  }

  public getBufferingQuality(streamType: string): number {
    return this._streamController ? this._streamController.getBufferingQuality(streamType) : this._settings.targetQuality[streamType];
  }

  public getMaxQuality(streamType: string): number {
    let stream = this._settings.manifest ? this._settings.manifest.streams[streamType] : null;

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

      this._events.raise(Dashling.SessionStateChangeEvent, {
        state: state,
        errorType: errorType,
        errorMessage: errorMessage
      });
    }
  }

  private _initializeMediaSource(videoElement: HTMLVideoElement) {
    let sessionIndex = this._sessionIndex;
    let mediaSource;

    try {
      mediaSource = new MediaSource();
    } catch (e) {
      this._setState(DashlingSessionState.error, DashlingError.mediaSourceInit);
    }

    if (mediaSource) {
      mediaSource.addEventListener("sourceopen", _onOpened, false);
      videoElement.src = URL.createObjectURL(mediaSource);
    }

    function _onOpened() {
      mediaSource.removeEventListener("sourceopen", _onOpened);

      if (this._sessionIndex === sessionIndex) {
        this._mediaSource = mediaSource;
        this._tryStart();
      }
    }
  }

  private _initializeManifest(url: string) {
    let sessionIndex = this._sessionIndex;

    let onParserSuccess = (manifest: Manifest) => {
      if (this._sessionIndex === sessionIndex && this.state !== DashlingSessionState.error) {
        this._settings.manifest = manifest;
        this._tryStart();
      }
    };

    let onParserError = (errorType: string, errorMessage: string) => {
      if (this._sessionIndex === sessionIndex) {
        this._setState(DashlingSessionState.error, errorType, errorMessage);
      }
    };

    if (this._settings.manifest) {
      onParserSuccess(this._settings.manifest);
    } else {
      let parser = this._parser = new ManifestParser(this._settings);

      parser.parse(url, onParserSuccess, onParserError);
    }
  }

  private _tryStart() {
    if (
      this.state !== DashlingSessionState.error &&
      this._mediaSource &&
      this._settings.manifest
    ) {

      this._mediaSource.duration = this._settings.manifest.mediaDuration;

      this._streamController = new StreamController(
        this._videoElement,
        this._mediaSource,
        this._settings);

      // TODO forward download events from steamcontroller out?

      this._events.on(this._streamController, DashlingEvent.sessionStateChange, (ev: IStateChangeEventArgs) => {
        this._setState(ev.state, ev.errorType, ev.errorMessage);
      });

      this._streamController.start();
    }
  }

}

