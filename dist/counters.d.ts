import { CountersOptions } from './counters';
import { ProcessInfo } from './utils';
/**
 * A data structure to hold all the computed statistics for a test runs.
 * These are the various computed metrics for the test that we spit out.
 * @export
 * @interface ComputedStatistics
 */
export interface ComputedStatistics {
    elapsedTime: number;
    metricValue: number;
    iterations: number[];
    ninetyfifthPercentile: number;
    ninetiethPercentile: number;
    fiftiethPercentile: number;
    average: number;
    primaryMetric: string;
    secondaryMetric?: string;
}
/**
 * Defines an interface to collect the counters for a given process or for the whole system
 *
 * @export
 * @interface ProcessStatistics
 * @param cpu - percentage (from 0 to 100*vcore).
 * @param memory - bytes used by the process.
 * @param ppid - parent process id. undefined for system stats. -1 for totals record for totals record for all the tracked processes.
 * @param pid - process id. primary key. 0 for system stats. -1 for totals record for all the tracked processes.
 * @param ctime - ms user + system time.
 * @param elapsed - ms since the start, of the process/test/system depending on context.
 * @param timestamp - ms since epoch.
 */
export interface ProcessStatisticsCollection {
    cpu: number[];
    memory: number[];
    ppid: number;
    pid: number;
    ctime?: number[];
    elapsed: number[];
    timestamp: number[];
}
export interface ProcessStatistics {
    cpu: number;
    memory: number;
    ppid: number;
    pid: number;
    ctime?: number;
    elapsed: number;
    timestamp: number;
}
export declare const ProcessStatisticsUnits: any;
/**
 * Defines an interface to specify the counters options for counters tests.
 * @param collectionInterval - the number of milliseconds after which the counters are collected. Default value is provided by environment variable: CountersCollectionInterval and if undefined then by {@link DefaultCountersOptions}.
 * @param includeMovingAverages - flag if we should compute movingAverages. Default value is provided by environment variable: CountersIncludeMovingAverages and if undefined then by {@link DefaultCountersOptions}.
 * @param dumpToFile - flag if counters should be dumped to file. Default value is provided by environment variable: CountersDumpToFile and if undefined then by {@link DefaultCountersOptions}.
 * @param dumpToChart - flag if counters should be dumped to charts. Default value is provided by environment variable: CountersDumpToChart and if undefined then by {@link DefaultCountersOptions}.
 * @param outputDirectory - provides path to outputDirectory where output files are written. Default value is provided by environment variable: CountersOutputDirectory and if undefined then by {@link DefaultCountersOptions}.
 */
export interface CountersOptions {
    collectionInterval?: number;
    includeParent?: boolean;
    includeMovingAverages?: boolean;
    dumpToFile?: boolean;
    dumpToChart?: boolean;
    outputDirectory?: string;
}
/**
 * The default values for CountersOptions.
 */
export declare const DefaultCountersOptions: CountersOptions;
/**
 * A class with methods that help to implement the counters collection for a test method.
 */
export declare class Counters {
    static readonly MaxCollectionInterval: number;
    static readonly ProcessInfoUpdationInterval: number;
    static readonly TotalsProcessInfo: ProcessInfo;
    /**
     * the root pid of processes that we are tracking
     *
     * @type {number}
     * @memberof Counters
     */
    readonly pid: number;
    /**
     * Number of milliseconds interval at which to collect the data.
     *
     * @type {number}
     * @memberof Counters
     */
    readonly collectionInterval: number;
    /**
     * whether we should include parent of the pid in the process that we are tracking. Including parent implies
     * we track all of the parent's children and not just the process designated by {@link pid}
     *
     * @type {boolean}
     * @memberof Counters
     */
    readonly includeParent: boolean;
    /**
     * whether we should dump the counters to file identified by the name of the counter.
     *
     * @type {boolean}
     * @memberof Counters
     */
    readonly includeMovingAverages: boolean;
    readonly dumpToFile: boolean;
    /**
     * whether we should dump the counters to charts identified by the name of the counter.
     *
     * @type {boolean}
     * @memberof Counters
     */
    readonly dumpToChart: boolean;
    /**
     * Name of this counter. This is used to identify all generated files.
     *
     * @type {string}
     * @memberof Counters
     */
    readonly name: string;
    /**
     * directory where to dump files and charts. default is process's cwd.
     *
     * @type {string}
     * @memberof Counters
     */
    readonly outputDirectory: string;
    /**
     * the collection of counters for this object corresponding to {@link pid}, and {@link includeParent}
     *
     * @type {Map<number,ProcessStatisticsCollection>}
     * @memberof Counters
     */
    collection: Map<number, ProcessStatisticsCollection>;
    /**yarn
     * the simple moving average over 4 elements of {@link collection} of counters for this object corresponding to {@link pid}, and {@link includeParent}
     *
     * @type {Map<number,ProcessStatisticsCollection>}
     * @memberof Counters
     */
    smaOver4Collection: Map<number, ProcessStatisticsCollection>;
    /**
     * the exponential moving average over 4 elements of {@link collection} of counters for this object corresponding to {@link pid}, and {@link includeParent}
     *
     * @type {Map<number,ProcessStatisticsCollection>}
     * @memberof Counters
     */
    emaOver4Collection: Map<number, ProcessStatisticsCollection>;
    /**
     * the computed statistics on the collected results. These are consistent with the number we need to submit to performance frameworks for baselining the results.
     *
     * @type ComputedStatistics}
     * @memberof Counters
     */
    computedStatistics: ComputedStatistics;
    /**
      * Constructor allows for construction with a bunch of optional parameters
      *
      *
      * @param name - Name of this counter. This is used to identify all generated files.
      * @param pid -  the root pid of processes that we are tracking
      * @param includeParent - flag to indicate if we should include parent of the pid in the process that we are tracking. Including parent implies we track all of the parent's children and not just the process designated by {@link pid}
      * @param object of @type {CountersOptions} with:
            * @param collectionInterval - see {@link CountersOptions}.
            * @param includeMovingAverages - see {@link CountersOptions}.
            * @param dumpToFile - see {@link CountersOptions}.
            * @param dumpToChart - see {@link CountersOptions}.
            * @param outputDirectory - see {@link CountersOptions}.
      */
    constructor(name: string, pid?: number, includeParent?: boolean, { collectionInterval: collectionInterval, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory }?: CountersOptions);
    /**
     * This method starts the data collection. It stops any previous ongoing collection on this object before starting this one. See {@link stop} for more details on what the stop method does.
     */
    start(): Promise<void>;
    /**
     * This method stops the data collection.
     * If {@link includeMovingAverages} was set then it populates the moving average data.
     * If {@link dumpToFile} was set then it dumps the collected data to files.
     * If {@link dumpToChart} was set then it dumps out charts corresponding to the data collected.
     */
    stop(): Promise<void>;
    private writeProcessesInfos;
    private writeCharts;
    private writeChart;
    private writeCollectionData;
    private getFileNamePrefix;
    /**
     * This method resets this object. It stops any ongoing collection as well as clears any collected data.
     */
    reset(): Promise<void>;
    private processesToTrack;
    private processesToTrackTimer;
    private countersTimer;
    private processesToTrackUpdationPromise;
    private countersCollectionPromise;
    private processesToTrackUpdationInProgress;
    private countersCollectionInProgress;
    private stopPopulatingProcessInfos;
    private stopCollecting;
    private startPopulatingProcessInfos;
    private startCollecting;
    private computeTotals;
    private computeAndWriteStatistics;
    private computeMovingAverages;
    private getCounters;
    private static getDumpToFile;
    private static getDumpToChart;
    private static getIncludeMovingAverages;
    private static getCollectionInterval;
    private static getOutputDirectory;
    /**
     *
     *
     * @static
     * @param {()=> void} closureForCollection - the body of code while executing which the performance counters are collected.
     * @param {string} name - the name of this collector. This is the typically a friendly name of the block of code for which we are doing performance collection and is a identifier for files that are generated.
     * @param {number} [pid=process.pid] - the process pid for which we collect performance counters. We collect for the given pid and for all recursive children and grand children for this pid. Default is current process.
     * @param {boolean} [includeParent=true] - if true we collect performance counters for all recursive children and grand children or {@link pid} process' parent. Default is true.
     * @param {CountersOptions} [{ collectionInterval, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory }={}] - various options to influence collection behavior. See {@link CountersOptions} for details.
     * @returns {Promise<void>} - returns a promise.
     * @memberof Counters
     */
    static CollectPerfCounters(closureForCollection: () => void, name: string, pid?: number, includeParent?: boolean, { collectionInterval, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory }?: CountersOptions): Promise<void>;
}
/**
 * Decorator Factory to return a decorator function that will collect performance counters for any object instance's 'async' method.
 * 	Using the decorator factory allows us pass options to the decorator itself separately from the arguments
 * 	of the function being modified.
 *
 * @export
 * @param {string} name - the name of this collector. This is the typically a friendly name of the block of code for which we are doing performance collection and is a identifier for files that are generated.
 * @param {number} [pid=process.pid] - the process pid for which we collect performance counters. We collect for the given pid and for all recursive children and grand children for this pid. Default is current process.
 * @param {boolean} [includeParent=true] - if true we collect performance counters for all recursive children and grand children or {@link pid} process' parent. Default is true.
 * @param {CountersOptions} [{ collectionInterval, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory }={}] - various options to influence collection behavior. See {@link CountersOptions} for details.
 * @returns {(target: any, memberName: string, memberDescriptor: PropertyDescriptor) => PropertyDescriptor} - returns the decorator method that is modified version of the method being decorated.
 */
export declare function collectPerfCounters(name: string, pid?: number, includeParent?: boolean, { collectionInterval, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory }?: CountersOptions): (target: any, memberName: string, memberDescriptor: PropertyDescriptor) => PropertyDescriptor;
