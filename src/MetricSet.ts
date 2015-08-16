export default class MetricSet {
    public metricValues: number[];
    public average: number;
    public min: number;
    public max: number;

    private _max: number;

    constructor(max: number) {
        this.metricValues = [];
        this.average = 0;
        this._max = max;
    }

    public addMetric(value: any) {
        this.average = this.average + ((value - this.average) / (this.metricValues.length + 1));
        this.metricValues.push(value);

        while (this.metricValues.length > this._max) {
            this._removeFirstMetric();
        }

        this.min = Math.min(value, this.min);
        this.max = Math.max(value, this.max);
    }

    public reset() {
      this.metricValues = [];
      this.average = this.min = this.max = 0;
    }

    private _removeFirstMetric() {
        var value = this.metricValues.shift();
        var average = this.average;

        this.average = this.average + ((this.average - value) / this.metricValues.length);
    }
}