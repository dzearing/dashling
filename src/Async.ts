export default class Async {
  private _parent: any;
  private _isDisposed: boolean;
  private _throttleIds: { [key: string]: number };
  private _timeoutIds: { [key: number]: boolean };

  public constructor(parent: any) {
    this._parent = parent;
    this._throttleIds = {};
    this._timeoutIds = {};
  }

  public dispose() {
    if (!this._isDisposed) {
      this._isDisposed = true;
      this.clearAllThrottles();
      this.clearAllTimeouts();
    }
  }

  public setTimeout(func: () => any, delay: number): number {
    let timeoutId: number;

    timeoutId = setTimeout(() => {
      delete this._timeoutIds[timeoutId];
      timeoutId = 0;
      func.apply(this._parent);
    }, delay);

    if (timeoutId) {
      this._timeoutIds[timeoutId] = true;
    }

    return timeoutId;
  }

  public clearTimeout(timeoutId: number) {
    clearTimeout(timeoutId);
    delete this._timeoutIds[timeoutId];
  }

  public clearAllTimeouts() {
    for (let id in this._timeoutIds) {
      clearTimeout(id);
    }
    this._timeoutIds = {};
  }

  public throttle(func: () => any, id: string, minTime: number, shouldReset: boolean, shouldCallImmediately: boolean) {
    if (shouldReset) {
      this.clearThrottle(id);
    }

    if (!this._throttleIds[id]) {
      this._throttleIds[id] = setTimeout(() => {
        if (!shouldCallImmediately) {
          func.apply(this._parent);
        }

        delete this._throttleIds[id];
      }, minTime);

      if (shouldCallImmediately) {
        shouldCallImmediately = false;
        func.apply(this._parent);
      }
    }
  }

  public clearThrottle(id: string) {
    if (this._throttleIds) {
      clearTimeout(this._throttleIds[id]);
      delete this._throttleIds[id];
    }
  }

  public clearAllThrottles() {
    if (this._throttleIds) {
      for (let id in this._throttleIds) {
        clearTimeout(this._throttleIds[id]);
      }
      this._throttleIds = null;
    }
  }

}

