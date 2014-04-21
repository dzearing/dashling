Dashling.BandwidthMonitor = function(defaultBitsPerSecond, movingAverageSize) {
  _mix(this, {
    _defaultBitsPerSecond: defaultBitsPerSecond,
    _movingAverageSize: movingAverageSize,
    _bpsSamples: [],
    _estimateMultiplier: 1
  });
};

Dashling.BandwidthMonitor.prototype = {

  getEstimatedTime: function(fileSize) {
    var bitSize = fileSize * 8;
    var bitRate = this._bpsSamples.average || this._defaultBitsPerSecond;

    return (1000 * this._estimateMultiplier * bitSize) / bitRate;
  },

  getVariance: function() {

  },

  getBitsPerSecond: function() {
    return this._bpsSamples.average || this._defaultBitsPerSecond;
  },

  getEstimateMultiplier: function() {
    return this._estimateMultiplier;
  },

  report: function(byteLength, estimatedTime, actualTime) {

  }
};