"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This module contains all the definitions for Counters decorators and the utility functions and definitions thereof
*/
const class_validator_1 = require("class-validator");
const utils_1 = require("./utils");
const charts_1 = require("./charts");
const util_1 = require("util");
const path = require("path");
const fs = require("fs");
const os = require("os");
const osu = require("node-os-utils");
const pidusage = require("pidusage");
const assert = require("assert");
const moving_averages_1 = require("moving-averages");
const simple_statistics_1 = require("simple-statistics");
const writeFileWithPromise = util_1.promisify(fs.writeFile);
const logPrefix = 'adstest:counters';
const debug = require('debug')(`${logPrefix}`);
exports.ProcessStatisticsUnits = {
    cpu: '%',
    memory: 'bytes',
    ctime: 'ms',
    elapsed: 'ms',
    timestamp: 'ms'
};
/**
 * The default values for CountersOptions.
 */
exports.DefaultCountersOptions = { collectionIntervalMs: 200, includeMovingAverages: true, dumpToFile: true, dumpToChart: true, outputDirectory: `${os.tmpdir()}` };
/**
 * A class with methods that help to implement the counters collection for a test method.
 */
class Counters {
    /**
      * Constructor allows for construction with a bunch of optional parameters
      *
      *
      * @param name - Name of this counter. This is used to identify all generated files.
      * @param pid -  the root pid of processes that we are tracking
      * @param includeParent - flag to indicate if we should include parent of the pid in the process that we are tracking. Including parent implies we track all of the parent's children and not just the process designated by {@link pid}
      * @param object of @type {CountersOptions} with:
            * @param collectionIntervalMs - see {@link CountersOptions}.
            * @param includeMovingAverages - see {@link CountersOptions}.
            * @param dumpToFile - see {@link CountersOptions}.
            * @param dumpToChart - see {@link CountersOptions}.
            * @param outputDirectory - see {@link CountersOptions}.
      */
    constructor(name, pid = process.pid, includeParent = true, { collectionIntervalMs: collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory } = {}) {
        /**
         * the collection of counters for this object corresponding to {@link pid}, and {@link includeParent}
         *
         * @type {Map<number,ProcessStatisticsCollection>}
         * @memberof Counters
         */
        this.collection = new Map();
        /**
         * the simple moving average over 4 elements of {@link collection} of counters for this object corresponding to {@link pid}, and {@link includeParent}
         *
         * @type {Map<number,ProcessStatisticsCollection>}
         * @memberof Counters
         */
        this.smaOver4Collection = new Map();
        /**
         * the exponential moving average over 4 elements of {@link collection} of counters for this object corresponding to {@link pid}, and {@link includeParent}
         *
         * @type {Map<number,ProcessStatisticsCollection>}
         * @memberof Counters
         */
        this.emaOver4Collection = new Map();
        //processes to track for counters  
        this.processesToTrack = [];
        // timer for updating processesToTrack in case the process at the root of {@link pid} has changed.
        this.processesToTrackTimer = null;
        // timer for collecting the statistics of the  processes that we are tracking.
        this.countersTimer = null;
        // Promise for updating processesToTrack in case the process at the root of {@link pid} has changed.
        this.processesToTrackUpdatePromise = null;
        // Promise for collecting the statistics of the  processes that we are tracking.
        this.countersCollectionPromise = null;
        // flag for updating processesToTrack in case the process at the root of {@link pid} has changed.
        this.processesToTrackUpdateInProgress = false;
        // flag for collecting the statistics of the  processes that we are tracking.
        this.countersCollectionInProgress = false;
        const trace = require('debug')(`${logPrefix}:constructor:trace`);
        trace(`parameters: name=${name}`);
        trace(`parameters: collectionIntervalMs=${collectionIntervalMs}`);
        trace("parameters: includeMovingAverages:", includeMovingAverages);
        trace("parameters: dumpToFile:", dumpToFile);
        trace("parameters: dumpToChart:", dumpToChart);
        trace("parameters: outputDirectory:", outputDirectory);
        this.name = name;
        this.pid = pid;
        this.includeParent = includeParent;
        this.collectionIntervalMs = Counters.getCollectionInterval(collectionIntervalMs);
        this.includeMovingAverages = Counters.getIncludeMovingAverages(includeMovingAverages);
        this.dumpToFile = Counters.getDumpToFile(dumpToFile);
        this.dumpToChart = Counters.getDumpToChart(dumpToChart);
        this.outputDirectory = Counters.getOutputDirectory(outputDirectory);
        // validate this object
        //
        let validationErrors = class_validator_1.validateSync(this);
        if (validationErrors.length > 0) {
            trace(`throwing validationErrors::${utils_1.jsonDump(validationErrors)}`);
            throw validationErrors;
        }
        trace(`default properties this object after construction: this.name=${this.name}, this.pid=${this.pid}, this.includeParent=${this.includeParent}, this.collectionIntervalMs=${this.collectionIntervalMs}, this.includeMovingAverages=${this.includeMovingAverages}, this.dumpToFile=${this.dumpToFile}, this.dumpToChart=${this.dumpToChart}, this.outputDirectory=${this.outputDirectory}`);
    }
    /**
     * This method starts the data collection. It stops any previous ongoing collection on this object before starting this one. See {@link stop} for more details on what the stop method does.
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            //stop collection first in case it is already in progress. This is inferred by in progress(defined) timers
            //
            if (this.countersTimer || this.processesToTrackTimer) {
                yield this.stop();
            }
            yield this.startPopulatingProcessInfos();
            yield this.startCollecting();
        });
    }
    /**
     * This method stops the data collection.
     * If {@link includeMovingAverages} was set then it populates the moving average data.
     * If {@link dumpToFile} was set then it dumps the collected data to files.
     * If {@link dumpToChart} was set then it dumps out charts corresponding to the data collected.
     */
    stop() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.stopPopulatingProcessInfos();
            yield this.stopCollecting();
            pidusage.clear();
            const promises = [];
            yield this.computeTotals();
            if (this.includeMovingAverages) {
                yield this.computeMovingAverages();
            }
            // We now write out a bunch of files. These are for the data collected, the process information for which we collected
            // the data, the moving averages of the data, the statistical computations (ComputedStatistics) on the data, 
            // the charts for all data and the moving averages. Since these are all quite independent tasks all based off the data that we collected
            // and since all are being written to separate files we start them all in parallel and then wait for all of them to complete.
            promises.push(this.computeAndWriteStatistics());
            if (this.dumpToFile) {
                promises.push(this.writeCollectionData());
                promises.push(writeFileWithPromise(`${this.getOutputFileNameForProcess()}_processInfo.json`, utils_1.jsonDump(this.processesToTrack)));
            }
            if (this.dumpToChart) {
                promises.push(this.writeCharts());
            }
            yield Promise.all(promises);
        });
    }
    writeCharts() {
        return __awaiter(this, void 0, void 0, function* () {
            const trace = require('debug')(`${logPrefix}:writeCharts:trace`);
            let promises = [];
            [Counters.WholeComputerProcessInfo, Counters.TotalsProcessInfo, ...this.processesToTrack].forEach((proc) => {
                let file = `${this.getOutputFileNameForProcess(proc)}_chart.png`;
                trace(`chart file name: ${file}`);
                if (this.collection[proc.pid]) {
                    // if we have collected data for this process then write Chart for it.
                    promises.push(this.writeChart(file, this.collection[proc.pid]));
                }
                if (this.includeMovingAverages) {
                    file = `${this.getOutputFileNameForProcess(proc)}_sma_chart.png`;
                    trace(`sma chart file name: ${file}`);
                    if (this.smaOver4Collection[proc.pid]) {
                        // if we have simple moving average data computed for this process then  write Chart for it.
                        promises.push(this.writeChart(file, this.smaOver4Collection[proc.pid]));
                    }
                    file = `${this.getOutputFileNameForProcess(proc)}_ema_chart.png`;
                    trace(`ema chart file name: ${file}`);
                    if (this.emaOver4Collection[proc.pid]) {
                        // if we have exponential moving average data computed for this process then  write Chart for it.	
                        promises.push(this.writeChart(file, this.emaOver4Collection[proc.pid]));
                    }
                }
            });
            trace(`waiting for all chart files to be written out ...`);
            yield Promise.all(promises);
        });
    }
    writeChart(file, processCollection) {
        return __awaiter(this, void 0, void 0, function* () {
            const trace = require('debug')(`${logPrefix}:writeChart:trace`);
            trace(`processStats=${utils_1.jsonDump(processCollection)}`);
            const xKey = 'timestamp';
            const xData = processCollection[xKey];
            const xAxisLabel = `${xKey}(${exports.ProcessStatisticsUnits[xKey]})`;
            const lines = [];
            const title = path.parse(file).name; //get just file name without directory paths and extension
            Object.keys(processCollection)
                .filter(key => key !== 'elapsed' && key !== 'timestamp' && key !== 'pid' && key !== 'ppid')
                .forEach(key => {
                lines.push({
                    label: `${key}(${exports.ProcessStatisticsUnits[key]})`,
                    data: processCollection[key]
                });
            });
            trace(`xData:${utils_1.jsonDump(xData)}, lines:${utils_1.jsonDump(lines)}, xAxisLabel: ${xAxisLabel}, file:${file}, title:${title}`);
            yield charts_1.writeChartToFile(xData, lines, 'png', processCollection.timestamp[0], xAxisLabel, file, title);
        });
    }
    writeCollectionData() {
        return __awaiter(this, void 0, void 0, function* () {
            // data, simple moving average data and exponential moving average data are all written to different files
            // so we kick them all off and then wait for all of them to complete.
            let promises = [];
            let file = `${this.getOutputFileName()}_data.json`;
            promises.push(writeFileWithPromise(file, utils_1.jsonDump(this.collection)));
            if (this.includeMovingAverages) {
                file = `${this.getOutputFileName()}_sma_data.json`;
                promises.push(writeFileWithPromise(file, utils_1.jsonDump(this.smaOver4Collection)));
                file = `${this.getOutputFileName()}_ema_data.json`;
                promises.push(writeFileWithPromise(file, utils_1.jsonDump(this.emaOver4Collection)));
            }
            yield Promise.all(promises);
        });
    }
    getOutputFileNameForProcess(proc = undefined) {
        let file = this.getOutputFileName();
        if (proc) {
            file = proc.pid > 0 ? `${file}__${proc.name}_${proc.pid}` : `${file}__${proc.name}`;
        }
        return file.replace('.', '_');
    }
    getOutputFileName() {
        return path.join(this.outputDirectory, this.name);
    }
    /**
     * This method resets this object. It stops any ongoing collection as well as clears any collected data.
     */
    reset() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.stop();
            this.collection.clear();
            this.smaOver4Collection.clear();
            this.emaOver4Collection.clear();
        });
    }
    stopPopulatingProcessInfos() {
        return __awaiter(this, void 0, void 0, function* () {
            clearInterval(this.processesToTrackTimer);
            if (this.processesToTrackTimer) {
                this.processesToTrackTimer.unref();
                this.processesToTrackTimer = null;
            }
            yield this.processesToTrackUpdatePromise;
        });
    }
    stopCollecting() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.countersCollectionPromise;
            clearInterval(this.countersTimer);
            if (this.countersTimer) {
                this.countersTimer.unref();
                this.countersTimer = null;
            }
        });
    }
    startPopulatingProcessInfos() {
        return __awaiter(this, void 0, void 0, function* () {
            assert(this.processesToTrackTimer === null, `the processesToTrackTimer should be null when we startPopulatingProcessInfos`);
            const getProcessInfos = () => __awaiter(this, void 0, void 0, function* () {
                // start updating processesToTrack unless previous update is still in progress.
                if (!this.processesToTrackUpdateInProgress) {
                    debug(`getting current processInfo for ${this.name}`);
                    this.processesToTrackUpdateInProgress = true;
                    this.processesToTrack = yield utils_1.getChildrenTree(this.pid, this.includeParent);
                    this.processesToTrackUpdateInProgress = false;
                }
            });
            // kickoff the collection of processes to track and await 
            // them to be collected for the first time so that processesToTrack is initialized
            this.processesToTrackUpdatePromise = getProcessInfos();
            yield this.processesToTrackUpdatePromise; //if we do not await here we will start trying to collect the perf counters when we have not yet figured what full set of processes to track, so we await here for all the processes to be tracked to become available.
            // set a timer to keep getting processes to track at regular intervals.
            this.processesToTrackTimer = setInterval(() => {
                if (!this.processesToTrackUpdateInProgress) {
                    this.processesToTrackUpdatePromise = getProcessInfos();
                }
            }, Counters.ProcessInfoUpdateIntervalMs);
        });
    }
    startCollecting() {
        return __awaiter(this, void 0, void 0, function* () {
            assert(this.countersTimer === null, `the countersTimer should be null when we startCollecting`);
            const collectCounters = () => __awaiter(this, void 0, void 0, function* () {
                const trace = require('debug')(`${logPrefix}:collectCounters:${this.name}:trace`);
                // start collecting counters unless previous collection set is still in progress.
                if (!this.countersCollectionInProgress) {
                    trace(`${Date.now()}:: collecting counters for ${this.name}`);
                    this.countersCollectionInProgress = true;
                    const cs = {
                        cpu: (osu.cpu.average()).avgTotal,
                        memory: os.totalmem() - os.freemem(),
                        ppid: Counters.WholeComputerProcessInfo.ppid,
                        pid: Counters.WholeComputerProcessInfo.pid,
                        elapsed: os.uptime() * 1000,
                        timestamp: Date.now()
                    };
                    [cs, ...yield this.getCounters()].forEach(processStatistics => {
                        Object.keys(processStatistics).filter(key => (key !== "pid" && key !== "ppid")).forEach(prop => {
                            if (!this.collection[processStatistics.pid]) {
                                this.collection[processStatistics.pid] = {
                                    pid: processStatistics.pid,
                                    ppid: processStatistics.ppid
                                };
                            }
                            if (!this.collection[processStatistics.pid][prop]) {
                                this.collection[processStatistics.pid][prop] = [];
                            }
                            this.collection[processStatistics.pid][prop].push(processStatistics[prop]);
                        });
                    });
                    trace(`${Date.now()}:: counters collection done`);
                    this.countersCollectionInProgress = false;
                }
            });
            // Kickoff the first collection
            this.countersCollectionPromise = collectCounters();
            // Set a timer for future collections
            this.countersTimer = setInterval(() => {
                if (!this.countersCollectionInProgress) {
                    this.countersCollectionPromise = collectCounters();
                }
            }, this.collectionIntervalMs);
        });
    }
    computeTotals() {
        return __awaiter(this, void 0, void 0, function* () {
            const trace = require('debug')(`${logPrefix}:computeTotals:trace`);
            // Totals are stored in a record corresponding to {@link Counters.TotalsProcessInfo}
            trace(`collection: ${utils_1.jsonDump(this.collection)}`);
            trace(`collection.keys: ${utils_1.jsonDump(Object.keys(this.collection))}`);
            trace(`this.collection: ${utils_1.jsonDump(this.collection)}`);
            trace("this.pid:", this.pid);
            this.collection[Counters.TotalsProcessInfo.pid] = {
                cpu: [],
                memory: [],
                ppid: Counters.TotalsProcessInfo.ppid,
                pid: Counters.TotalsProcessInfo.pid,
                ctime: [],
                elapsed: this.collection[this.pid].elapsed,
                timestamp: this.collection[this.pid].timestamp,
            };
            // compute and store totals for each timestamp value. 
            for (let i in this.collection[Counters.TotalsProcessInfo.pid].timestamp) {
                let cpu = 0;
                let memory = 0;
                let ctime = 0;
                this.processesToTrack.forEach(proc => {
                    // we have collected anything for this process then add its stats to the totals
                    if (this.collection[proc.pid]) {
                        cpu += this.collection[proc.pid].cpu[i];
                        memory += this.collection[proc.pid].memory[i];
                        ctime += this.collection[proc.pid].ctime[i];
                    }
                });
                this.collection[Counters.TotalsProcessInfo.pid].cpu[i] = cpu;
                this.collection[Counters.TotalsProcessInfo.pid].memory[i] = memory;
                this.collection[Counters.TotalsProcessInfo.pid].ctime[i] = ctime;
            }
            trace(`this.collection[Counters.TotalsProcessInfo.pid]: ${utils_1.jsonDump(this.collection[Counters.TotalsProcessInfo.pid])}`);
        });
    }
    computeAndWriteStatistics() {
        return __awaiter(this, void 0, void 0, function* () {
            const totalsStats = this.collection[-1];
            const datapoints = totalsStats.timestamp.length;
            let p95;
            let p90;
            let p50;
            [p50, p90, p95] = simple_statistics_1.quantile(totalsStats.memory, [.5, .9, .95]);
            const computedStats = {
                elapsedTime: totalsStats.elapsed[datapoints - 1] - totalsStats.elapsed[0],
                metricValue: p95,
                iterations: totalsStats.memory,
                ninetyfifthPercentile: p95,
                ninetiethPercentile: p90,
                fiftiethPercentile: p50,
                average: simple_statistics_1.mean(totalsStats.memory),
                primaryMetric: 'MemoryMetric'
            };
            this.computedStatistics = computedStats;
            const file = `${this.getOutputFileNameForProcess()}_statistics.json`;
            yield writeFileWithPromise(file, utils_1.jsonDump(computedStats));
        });
    }
    computeMovingAverages() {
        return __awaiter(this, void 0, void 0, function* () {
            for (let collectionStats of Object.values(this.collection)) {
                this.smaOver4Collection[collectionStats.pid] = {
                    pid: collectionStats.pid,
                    ppid: collectionStats.ppid
                };
                this.emaOver4Collection[collectionStats.pid] = {
                    pid: collectionStats.pid,
                    ppid: collectionStats.ppid
                };
                Object.keys(collectionStats).filter(key => (key !== "pid" && key !== "ppid")).forEach(prop => {
                    if (prop !== "elapsed" && prop !== "timestamp") {
                        this.smaOver4Collection[collectionStats.pid][prop] = moving_averages_1.ma([...this.collection[collectionStats.pid][prop]], 4).slice(3); //sma over '4' elements gives out an array of same size as input with first 3 elements values as nulls, so we prune them.
                        this.emaOver4Collection[collectionStats.pid][prop] = moving_averages_1.ema([...this.collection[collectionStats.pid][prop]], 4);
                    }
                    else {
                        //copy from corresponding collection while dropping the first 3 elements.Since moving averages produce values from 4th element
                        //
                        this.smaOver4Collection[collectionStats.pid][prop] = [...this.collection[collectionStats.pid][prop]].slice(3);
                        this.emaOver4Collection[collectionStats.pid][prop] = [...this.collection[collectionStats.pid][prop]];
                    }
                });
            }
            ;
        });
    }
    getCounters() {
        return __awaiter(this, void 0, void 0, function* () {
            const processStatistics = yield pidusage([...this.processesToTrack.map(p => p.pid)]);
            return [...Object.values(processStatistics)];
        });
    }
    static getDumpToFile(input) {
        return utils_1.getBoolean(input, utils_1.getBoolean(process.env.CountersDumpToFile, exports.DefaultCountersOptions.dumpToFile));
    }
    static getDumpToChart(input) {
        return utils_1.getBoolean(input, utils_1.getBoolean(process.env.CountersDumpToChart, exports.DefaultCountersOptions.dumpToChart));
    }
    static getIncludeMovingAverages(input) {
        return utils_1.getBoolean(input, utils_1.getBoolean(process.env.CountersIncludeMovingAverages, exports.DefaultCountersOptions.includeMovingAverages));
    }
    static getCollectionInterval(input) {
        return utils_1.nullNanUndefinedEmptyCoalesce(input, utils_1.nullNanUndefinedEmptyCoalesce(parseInt(process.env.CountersCollectionIntervalMs), exports.DefaultCountersOptions.collectionIntervalMs));
    }
    static getOutputDirectory(input) {
        if (input) {
            return input;
        }
        if (process.env.CountersOutputDirectory) {
            return process.env.CountersOutputDirectory;
        }
        return exports.DefaultCountersOptions.outputDirectory;
    }
    /**
     *
     *
     * @static
     * @param {()=> void} closureForCollection - the body of code while executing which the performance counters are collected.
     * @param {string} name - the name of this collector. This is the typically a friendly name of the block of code for which we are doing performance collection and is a identifier for files that are generated.
     * @param {number} [pid=process.pid] - the process pid for which we collect performance counters. We collect for the given pid and for all recursive children and grand children for this pid. Default is current process.
     * @param {boolean} [includeParent=true] - if true we collect performance counters for all recursive children and grand children or {@link pid} process' parent. Default is true.
     * @param {CountersOptions} [{ collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory }={}] - various options to influence collection behavior. See {@link CountersOptions} for details.
     * @returns {Promise<void>} - returns a promise.
     * @memberof Counters
     */
    static CollectPerfCounters(closureForCollection, name, pid = process.pid, includeParent = true, { collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const countersCollector = new Counters(name, pid, includeParent, { collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory });
            yield countersCollector.start();
            yield closureForCollection();
            yield countersCollector.stop();
        });
    }
}
Counters.MaxCollectionIntervalMs = 3600 * 1000; // in ms. MaxValue is 1 hour.
Counters.ProcessInfoUpdateIntervalMs = 10 * 1000; // 10 seconds. It takes 2-4 seconds to gather process information typically, so this value should not be lower than 5 seconds.
// We designate a pid and ppid of -1 for an artificial ProcessInfo object for keeping track of totals
Counters.TotalsProcessInfo = {
    pid: -1,
    ppid: -1,
    name: 'Totals of all Tracked Processes'
};
// We designate a pid and ppid of 0 for an artificial ProcessInfo object for keeping track of statistics collected for the entire machine
Counters.WholeComputerProcessInfo = {
    pid: 0,
    ppid: 0,
    name: 'Whole Computer'
};
__decorate([
    class_validator_1.IsDefined(),
    class_validator_1.IsInt(),
    class_validator_1.Min(0),
    __metadata("design:type", Number)
], Counters.prototype, "pid", void 0);
__decorate([
    class_validator_1.IsDefined(),
    class_validator_1.IsInt(),
    class_validator_1.Min(0),
    class_validator_1.Max(Counters.MaxCollectionIntervalMs),
    __metadata("design:type", Number)
], Counters.prototype, "collectionIntervalMs", void 0);
__decorate([
    class_validator_1.IsNotEmpty(),
    class_validator_1.IsBoolean(),
    __metadata("design:type", Boolean)
], Counters.prototype, "includeParent", void 0);
__decorate([
    class_validator_1.IsNotEmpty(),
    class_validator_1.IsBoolean(),
    __metadata("design:type", Boolean)
], Counters.prototype, "includeMovingAverages", void 0);
__decorate([
    class_validator_1.IsNotEmpty(),
    class_validator_1.IsBoolean(),
    __metadata("design:type", Boolean)
], Counters.prototype, "dumpToFile", void 0);
__decorate([
    class_validator_1.IsNotEmpty(),
    class_validator_1.IsBoolean(),
    __metadata("design:type", Boolean)
], Counters.prototype, "dumpToChart", void 0);
__decorate([
    class_validator_1.IsString(),
    class_validator_1.IsNotEmpty(),
    class_validator_1.Matches(/[a-z0-9_]/i, 'i'),
    __metadata("design:type", String)
], Counters.prototype, "name", void 0);
__decorate([
    class_validator_1.IsString(),
    class_validator_1.IsNotEmpty(),
    __metadata("design:type", String)
], Counters.prototype, "outputDirectory", void 0);
exports.Counters = Counters;
/**
 * Decorator Factory to return a decorator function that will collect performance counters for any object instance's 'async' method.
 * 	Using the decorator factory allows us pass options to the decorator itself separately from the arguments
 * 	of the function being modified.
 *
 * @export
 * @param {string} name - the name of this collector. This is the typically a friendly name of the block of code for which we are doing performance collection and is a identifier for files that are generated.
 * @param {number} [pid=process.pid] - the process pid for which we collect performance counters. We collect for the given pid and for all recursive children and grand children for this pid. Default is current process.
 * @param {boolean} [includeParent=true] - if true we collect performance counters for all recursive children and grand children or {@link pid} process' parent. Default is true.
 * @param {CountersOptions} [{ collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory }={}] - various options to influence collection behavior. See {@link CountersOptions} for details.
 * @returns {(target: any, memberName: string, memberDescriptor: PropertyDescriptor) => PropertyDescriptor} - returns the decorator method that is modified version of the method being decorated.
 */
function collectPerfCounters(name, pid = process.pid, includeParent = true, { collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory } = {}) {
    const debug = require('debug')(`${logPrefix}:collectPerfCounters`);
    // return the function that does the job of collecting the perf counters on an object instance method with decorator @collectPerfCounters
    //
    debug(`collectPerfCounters FactoryDecorator called with name=${name}, pid=${pid}, includeParent=${includeParent}, collectionIntervalMs=${collectionIntervalMs}, includeMovingAverages=${includeMovingAverages}, dumpToFile, dumpToChart, outputDirectory `);
    // The actual decorator function that modifies the original target method pointed to by the memberDescriptor
    //
    return function (target, memberName, memberDescriptor) {
        // Collect Performance Counters for the 'memberName' function on the 'target' object pointed to by the memberDescriptor.value only if SuiteType is stress
        //
        debug(`Collecting Performance Counters for the method:"${memberName}" of class:${utils_1.jsonDump(target.constructor.name)}`);
        // save a reference to the original method, this way we keep the values currently in the descriptor and not overwrite what another
        // decorator might have done to this descriptor by return the original descriptor.
        //
        const originalMethod = memberDescriptor.value;
        //modifying the descriptor's value parameter to point to a new method which is the collects the performance counters while executing the originalMethod
        //
        memberDescriptor.value = function (...args) {
            return __awaiter(this, void 0, void 0, function* () {
                // note usage of originalMethod here
                //
                yield Counters.CollectPerfCounters(() => __awaiter(this, void 0, void 0, function* () {
                    yield originalMethod.apply(this, args);
                }), name, pid, includeParent, { collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory });
            });
        };
        // return the original descriptor unedited.
        // the method pointed to by this descriptor was modified to a performance collecting version of the originalMethod.
        //
        return memberDescriptor;
    };
}
exports.collectPerfCounters = collectPerfCounters;
//# sourceMappingURL=counters.js.map