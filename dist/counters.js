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
const util_1 = require("util");
const path = require("path");
const fs = require("fs");
const os = require("os");
const osu = require("node-os-utils");
const pidusage = require("pidusage");
const assert = require("assert");
const moving_averages_1 = require("moving-averages");
const simple_statistics_1 = require("simple-statistics");
const writeFileAsync = util_1.promisify(fs.writeFile);
const logPrefix = 'adstest:counters';
/**
 * Subclass of Error to wrap any Error objects caught during Counters Execution.
 */
class CountersError extends Error {
    constructor(error) {
        super();
        this.name = CountersError.code;
        this.inner = error;
        if (error instanceof Error) {
            this.message = error.message;
            this.stack = error.stack;
        }
        else if (error instanceof String) {
            this.message = error.valueOf();
            try {
                throw new Error();
            }
            catch (e) {
                this.stack = e.stack;
            }
        }
        else if (util_1.isString(error)) {
            this.message = error;
            try {
                throw new Error();
            }
            catch (e) {
                this.stack = e.stack;
            }
        }
        else {
            this.message = 'unknown counters error';
        }
    }
}
CountersError.code = 'ERR_COUNTERS';
exports.CountersError = CountersError;
/**
 * The default values for CountersOptions.
 */
exports.DefaultCountersOptions = { collectionInterval: 200, includeMovingAverages: true, dumpToFile: true, dumpToChart: true, outputDirectory: `${process.cwd()}` };
/**
 * A class with methods that help to implement the counters-ify decorator.
 * Keeping the core logic of counters-ification in one place as well as allowing this code to use
 * other decorators if needed.
 */
class Counters {
    /**
      * Constructor allows for construction with a bunch of optional parameters
      *
      *
      * @param name - Name of this counter. This is used to identify all generated files.
      * @param pid -  the root pid of processes that we are tracking
      * @param includeParent - flag to indicate if we should include parent of the pid in the process that we are tracking. Including parent implies we track all of the parent's children and not just the process designameted by {@link pid}
      * @param object of @type {CountersOptions} with:
            * @param collectionInterval - see {@link CountersOptions}.
            * @param includeMovingAverages - see {@link CountersOptions}.
            * @param dumpToFile - see {@link CountersOptions}.
            * @param dumpToChart - see {@link CountersOptions}.
            * @param outputDirectory - see {@link CountersOptions}.
      */
    constructor(name, pid = process.pid, includeParent = true, { collectionInterval: collectionInterval, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory } = {}) {
        /**
         * the collection of counters for this object corresponding to {@link pid}, and {@link includeParent}
         *
         * @type {Map<number,ProcessStatistics>}
         * @memberof Counters
         */
        this.collection = new Map();
        /**
         * the simple moving average over 4 elements of {@link collection} of counters for this object corresponding to {@link pid}, and {@link includeParent}
         *
         * @type {Map<number,ProcessStatistics>}
         * @memberof Counters
         */
        this.smaOver4Collection = new Map();
        /**
         * the exponential moving average over 4 elements of {@link collection} of counters for this object corresponding to {@link pid}, and {@link includeParent}
         *
         * @type {Map<number,ProcessStatistics>}
         * @memberof Counters
         */
        this.emaOver4Collection = new Map();
        //processes to track for counters  
        this.processesToTrack = [];
        // timer for udating processesToTrack in case the process at the root of {@link pid} has changed.
        this.processesToTrackTimer = null;
        // timer for collecting the statistics of the  processes that we are tracking.
        this.countersTimer = null;
        const trace = require('debug')(`${logPrefix}:constructor:trace`);
        trace(`parameters: name=${name}`);
        trace(`parameters: collectionInterval=${collectionInterval}`);
        trace("parameters: includeMovingAverages:", includeMovingAverages);
        trace("parameters: dumpToFile:", dumpToFile);
        trace("parameters: dumpToChart:", dumpToChart);
        trace("parameters: outputDirectory:", outputDirectory);
        trace(`default properties this object at beginning of constructor: this.name=${this.name}, this.pid=${this.pid}, this.includeParent=${this.includeParent}, this.collectionInterval=${this.collectionInterval}, this.includeMovingAverages=${this.includeMovingAverages}, this.dumpToFile=${this.dumpToFile}, this.dumpToChart=${this.dumpToChart}, this.outputDirectory=${this.outputDirectory}`);
        this.name = name;
        this.pid = pid;
        this.includeParent = includeParent;
        this.collectionInterval = Counters.getCollectionInterval(collectionInterval);
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
        trace(`default properties this object after construction: this.name=${this.name}, this.pid=${this.pid}, this.includeParent=${this.includeParent}, this.collectionInterval=${this.collectionInterval}, this.includeMovingAverages=${this.includeMovingAverages}, this.dumpToFile=${this.dumpToFile}, this.dumpToChart=${this.dumpToChart}, this.outputDirectory=${this.outputDirectory}`);
    }
    /**
     * This method starts the data collection. It stops any previous ongoing collection on this object before starting this one. See {@link stop} for more details on what the stop method does.
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            //stop collection first in case it is already in progress
            //
            this.stop();
            const promises = [];
            promises.push(this.startPopulatingProcessInfos());
            promises.push(this.startCollecting());
            yield Promise.all(promises);
        });
    }
    /**
     * This method stops the data collection.
     * If {@link includeMovingAverages} was set then it populates the moving average data.
     * If {@link dumpToFile} was set then it dumps the collected data to files.
     * If {@link dumpToChart} was set then it dumps out charts correspoinding to the data collected.
     */
    stop() {
        return __awaiter(this, void 0, void 0, function* () {
            this.stopPopulatingProcessInfos();
            this.stopCollecting();
            pidusage.clear();
            this.processesToTrackTimer = null;
            this.countersTimer = null;
            const promises = [];
            if (this.includeMovingAverages) {
                yield this.computeMovingAverages();
            }
            yield this.computeTotals();
            yield this.computePublishStatistics();
            if (this.dumpToFile) {
                promises.push(this.writeCollectionData());
                promises.push(this.writeProcessesInfos());
            }
            if (this.dumpToChart) {
                promises.push(this.writeCharts());
            }
            yield Promise.all(promises);
        });
    }
    writeProcessesInfos() {
        return __awaiter(this, void 0, void 0, function* () {
            let promises = [];
            this.processesToTrack.forEach((proc) => {
                let file = `${this.getFileNamePrefix(proc)}_processInfo.json`;
                promises.push(writeFileAsync(file, utils_1.jsonDump(proc)));
            });
            yield Promise.all(promises);
        });
    }
    writeCharts() {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error("Method not implemented.");
        });
    }
    writeCollectionData() {
        return __awaiter(this, void 0, void 0, function* () {
            let promises = [];
            this.processesToTrack.forEach((proc) => {
                let file = `${this.getFileNamePrefix(proc)}_data.json`;
                promises.push(writeFileAsync(file, utils_1.jsonDump(this.collection[proc.pid])));
                if (this.includeMovingAverages) {
                    file = `${this.getFileNamePrefix(proc)}_sma_data.json`;
                    promises.push(writeFileAsync(file, utils_1.jsonDump(this.smaOver4Collection[proc.pid])));
                    file = `${this.getFileNamePrefix(proc)}_ema_data.json`;
                    promises.push(writeFileAsync(file, utils_1.jsonDump(this.emaOver4Collection[proc.pid])));
                }
            });
            yield Promise.all(promises);
        });
    }
    getFileNamePrefix(proc) {
        return path.join(this.outputDirectory, `${proc.name}_${proc.pid}`.replace('.', '_'));
    }
    /**
     * This method resets this object. It stops any ongoing collection as well as clears any collected data.
     */
    reset() {
        this.stop();
        this.collection.clear();
        this.smaOver4Collection.clear();
        this.emaOver4Collection.clear();
    }
    stopPopulatingProcessInfos() {
        clearInterval(this.processesToTrackTimer);
        this.processesToTrackTimer.unref();
    }
    stopCollecting() {
        clearInterval(this.countersTimer);
        this.processesToTrackTimer.unref();
    }
    startPopulatingProcessInfos() {
        return __awaiter(this, void 0, void 0, function* () {
            assert(this.processesToTrackTimer === null, `the processesToTrackTimer should be null when we startPopulatingProcessInfos`);
            this.processesToTrackTimer = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                this.processesToTrack = yield utils_1.getChildrenTree(this.pid, this.includeParent);
            }), Counters.ProcessInfoUpdationInterval);
        });
    }
    startCollecting() {
        return __awaiter(this, void 0, void 0, function* () {
            assert(this.countersTimer === null, `the countersTimer should be null when we startCollecting`);
            this.countersTimer = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                const cs = {
                    cpu: (osu.cpu.average()).avgTotal,
                    memory: [os.totalmem() - os.freemem()],
                    ppid: undefined,
                    pid: 0,
                    elapsed: [os.uptime() * 1000],
                    timestamp: [Date.now()]
                };
                [cs, ...yield this.getCounters()].forEach(counterStats => {
                    Object.keys(counterStats).filter(key => (key !== "pid" && key !== "ppid")).forEach(prop => {
                        if (!this.collection[counterStats.pid]) {
                            this.collection[counterStats.pid] = {
                                pid: counterStats.pid,
                                ppid: counterStats.ppid
                            };
                        }
                        assert(counterStats[prop].length === 1);
                        this.collection[counterStats.pid][prop] = this.collection[counterStats.pid][prop] ? this.collection[counterStats.pid][prop].push(...counterStats[prop]) : counterStats[prop];
                    });
                });
            }), this.collectionInterval);
        });
    }
    computeTotals() {
        return __awaiter(this, void 0, void 0, function* () {
            // Totals are stored in a record with pid and ppid of -1.
            this.collection[-1] = {
                cpu: [],
                memory: [],
                ppid: -1,
                pid: -1,
                ctime: [],
                elapsed: this.collection[this.pid].elapsed,
                timestamp: this.collection[this.pid].timestamp,
            };
            for (let i in this.collection[this.pid].timestamp) {
                let cpu = 0;
                let memory = 0;
                let ctime = 0;
                this.processesToTrack.filter(proc => proc.pid > 0).forEach(proc => {
                    cpu += this.collection[proc.pid].cpu[i];
                    memory += this.collection[proc.pid].memory[i];
                    ctime += this.collection[proc.pid].ctime[i];
                });
                this.collection[this.pid].cpu[i] = cpu;
                this.collection[this.pid].memory[i] = memory;
                this.collection[this.pid].ctime[i] = ctime;
            }
        });
    }
    computePublishStatistics() {
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
        });
    }
    computeMovingAverages() {
        return __awaiter(this, void 0, void 0, function* () {
            for (let collectionStats of this.collection.values()) {
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
                        this.smaOver4Collection[collectionStats.pid][prop] = moving_averages_1.ma([...this.collection[collectionStats.pid][prop]], 4);
                        this.emaOver4Collection[collectionStats.pid][prop] = moving_averages_1.ema([...this.collection[collectionStats.pid][prop]], 4);
                    }
                    else {
                        //copy from corresponding collection while dropping the first 3 elements.Since moving averages produce values from 4th element
                        //
                        this.smaOver4Collection[collectionStats.pid][prop] = [...this.collection[collectionStats.pid][prop]].slice(3);
                        this.emaOver4Collection[collectionStats.pid][prop] = this.smaOver4Collection[collectionStats.pid][prop]; //refer to the same array as in sma collection as the contents are always same.
                    }
                });
            }
            ;
        });
    }
    getCounters() {
        return __awaiter(this, void 0, void 0, function* () {
            return [...yield pidusage(this.processesToTrack.map(p => p.pid))];
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
        return utils_1.nullNanUndefinedEmptyCoalesce(input, utils_1.nullNanUndefinedEmptyCoalesce(parseInt(process.env.CountersCollectionInterval), exports.DefaultCountersOptions.collectionInterval));
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
}
Counters.MaxCollectionInterval = 3600 * 1000; // in ms. MaxValue is 1 hour.
Counters.ProcessInfoUpdationInterval = 10 * 1000; // 10 milliseconds. It takes 2-4 seconds to gather process information typically, so this value should not be lower than 5 seconds.
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
    __metadata("design:type", Boolean)
], Counters.prototype, "includeParent", void 0);
__decorate([
    class_validator_1.IsDefined(),
    class_validator_1.IsInt(),
    class_validator_1.Min(0),
    class_validator_1.Max(Counters.MaxCollectionInterval),
    __metadata("design:type", Number)
], Counters.prototype, "collectionInterval", void 0);
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
    class_validator_1.IsAlphanumeric(),
    __metadata("design:type", String)
], Counters.prototype, "name", void 0);
__decorate([
    class_validator_1.IsString(),
    class_validator_1.IsNotEmpty(),
    __metadata("design:type", String)
], Counters.prototype, "outputDirectory", void 0);
exports.Counters = Counters;
//# sourceMappingURL=counters.js.map