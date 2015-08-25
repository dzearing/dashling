define(["require", "exports"], function (require, exports) {
    var MetricSet = (function () {
        function MetricSet(max) {
            this.metricValues = [];
            this.average = 0;
            this._max = max;
        }
        MetricSet.prototype.addMetric = function (value) {
            this.average = this.average + ((value - this.average) / (this.metricValues.length + 1));
            this.metricValues.push(value);
            while (this.metricValues.length > this._max) {
                this._removeFirstMetric();
            }
            this.min = Math.min(value, this.min);
            this.max = Math.max(value, this.max);
        };
        MetricSet.prototype.reset = function () {
            this.metricValues = [];
            this.average = this.min = this.max = 0;
        };
        MetricSet.prototype._removeFirstMetric = function () {
            var value = this.metricValues.shift();
            var average = this.average;
            this.average = this.average + ((this.average - value) / this.metricValues.length);
        };
        return MetricSet;
    })();
    exports.default = MetricSet;
});
