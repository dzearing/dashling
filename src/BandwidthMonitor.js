Dashling.BandwidthMonitor = function(defaultBitsPerSecond, movingAverageSize) {
  _mix(this, {
    _defaultBitsPerSecond: defaultBitsPerSecond,
    _movingAverageSize: movingAverageSize,
    _bpsSamples: [],
    _estimateMultiplier: 1
  });
};

Dashling.BandwidthMonitor.prototype = {

  getEstimatedMilliseconds: function(byteLength) {
    var bitLength = byteLength * 8;
    var bitRate = this._bpsSamples.average || this._defaultBitsPerSecond;

    return (1000 * this._estimateMultiplier * bitLength) / bitRate;
  },

  getVariance: function() {

  },

  getBitsPerSecond: function() {
    return this._bpsSamples.average || this._defaultBitsPerSecond;
  },

  getEstimateMultiplier: function() {
    return this._estimateMultiplier;
  },

  report: function(byteLength, estimatedMilliseconds, actualMilliseconds) {
    var bitLength = byteLength * 8;
    var bitRate = bitLength * 1000 / actualMilliseconds;

    _addMetric(this._bpsSamples, bitRate, this._movingAverageSize);
  }
};