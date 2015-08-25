import Dashling from './Dashling';
export default class DashlingMonitor {
    id: string;
    isActive: boolean;
    isVisible: boolean;
    element: HTMLElement;
    qualityContainer: any;
    subElements: {
        metrics: HTMLElement;
        audioElement: HTMLElement;
        audioMetrics: HTMLElement;
        audioQualities: HTMLElement;
        audioSeekBar: HTMLElement;
        videoElement: HTMLElement;
        videoMetrics: HTMLElement;
        videoQualities: HTMLElement;
        videoSeekBar: HTMLElement;
        key: HTMLElement;
    };
    private _dataContext;
    private _rowElements;
    private _metricCount;
    private _video;
    private _interval;
    private _videoElement;
    private _dashling;
    constructor();
    dispose(): void;
    attachTo(element: HTMLElement): void;
    observe(dashling: Dashling, videoElement: HTMLVideoElement): void;
    private _onSessionChanged();
    reset(): void;
    setVisibility(isVisible: boolean): void;
    setDataContext(dataContext: any): void;
    renderHtml(): string;
    activate(): void;
    deactivate(): void;
    private _updateSeekBar();
    private _update();
    private _updateMetrics(metricListElement, metrics);
    private _updateQualities(qualityListElement, qualities);
    private _updateFragments(fragmentListElement, fragments);
    private _createContext();
    private _getStats(player);
}
