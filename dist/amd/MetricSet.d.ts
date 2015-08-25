export default class MetricSet {
    metricValues: number[];
    average: number;
    min: number;
    max: number;
    private _max;
    constructor(max: number);
    addMetric(value: any): void;
    reset(): void;
    private _removeFirstMetric();
}
