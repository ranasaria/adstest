
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This module contains all the definitions for Counters decorators and the utility functions and definitions thereof
*/
import { Min, Max, IsInt, validateSync, ValidationError, IsDefined, IsString, IsNotEmpty, IsBoolean, Matches } from 'class-validator';
import { jsonDump, nullNanUndefinedEmptyCoalesce, getBoolean, ProcessInfo, getChildrenTree } from './utils';
import { writeChartToFile, LineData } from './charts';
import { promisify } from 'util';
import path = require('path');
import fs = require('fs');
import os = require('os');
import osu = require('node-os-utils');
import * as pidusage from 'pidusage';
import assert = require('assert');
import { ma as sma, ema } from 'moving-averages';
import { mean, quantile } from 'simple-statistics';

const writeFileWithPromise = promisify(fs.writeFile);
const logPrefix = 'adstest:counters';
const debug = require('debug')(`${logPrefix}`);

/**
 * A data structure to hold all the computed statistics for a test runs.
 * These are the various computed metrics for the test that we spit out.
 * The structure of this object mimics the fields of the data structure that needs to pushed to performance
 * frameworks so that we can baseline our results and hold the baseline from run to run. These baseline and tracking
 * variations from baseline is all done by the performance frameworks so long as we generate the information in this format
 * and publish it to those frameworks.
 * @export
 * @interface ComputedStatistics
 */
export interface ComputedStatistics {
	elapsedTime: number,
	metricValue: number,
	iterations: number[],
	ninetyfifthPercentile: number,
	ninetiethPercentile: number,
	fiftiethPercentile: number,
	average: number,
	primaryMetric: string,
	secondaryMetric?: string
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

export const ProcessStatisticsUnits: any = {
	cpu: '%',
	memory: 'bytes',
	ctime: 'ms',
	elapsed: 'ms',
	timestamp: 'ms'
}

/**
 * Defines an interface to specify the counters options for counters tests.
 * @param collectionIntervalMs - the number of milliseconds after which the counters are collected. Default value is provided by environment variable: CountersCollectionIntervalMs and if undefined then by {@link DefaultCountersOptions}.
 * @param includeMovingAverages - flag if we should compute movingAverages. Default value is provided by environment variable: CountersIncludeMovingAverages and if undefined then by {@link DefaultCountersOptions}.
 * @param dumpToFile - flag if counters should be dumped to file. Default value is provided by environment variable: CountersDumpToFile and if undefined then by {@link DefaultCountersOptions}.
 * @param dumpToChart - flag if counters should be dumped to charts. Default value is provided by environment variable: CountersDumpToChart and if undefined then by {@link DefaultCountersOptions}.
 * @param outputDirectory - provides path to outputDirectory where output files are written. Default value is provided by environment variable: CountersOutputDirectory and if undefined then by {@link DefaultCountersOptions}.
 */
export interface CountersOptions {
	collectionIntervalMs?: number;
	includeParent?: boolean;
	includeMovingAverages?: boolean;
	dumpToFile?: boolean;
	dumpToChart?: boolean;
	outputDirectory?: string;
}

/**
 * The default values for CountersOptions.
 */
export const DefaultCountersOptions: CountersOptions = { collectionIntervalMs: 200, includeMovingAverages: true, dumpToFile: true, dumpToChart: true, outputDirectory: `${os.tmpdir()}` };

/**
 * A class with methods that help to implement the counters collection for a test method.
 */
export class Counters {
	static readonly MaxCollectionIntervalMs = 3600 * 1000; // in ms. MaxValue is 1 hour.
	static readonly ProcessInfoUpdateIntervalMs = 10 * 1000; // 10 seconds. It takes 2-4 seconds to gather process information typically, so this value should not be lower than 5 seconds.

	// We designate a pid and ppid of -1 for an artificial ProcessInfo object for keeping track of totals
	static readonly TotalsProcessInfo: ProcessInfo = {
		pid: -1,
		ppid: -1,
		name: 'Totals of all Tracked Processes'
	}

	// We designate a pid and ppid of 0 for an artificial ProcessInfo object for keeping track of statistics collected for the entire machine
	static readonly WholeComputerProcessInfo: ProcessInfo = {
		pid: 0,
		ppid: 0,
		name: 'Whole Computer'
	}

	/**
	 * the root pid of processes that we are tracking
	 *
	 * @type {number}
	 * @memberof Counters
	 */
	@IsDefined()
	@IsInt()
	@Min(0)
	public readonly pid: number;

	/**
	 * Number of milliseconds interval at which to collect the data.
	 *
	 * @type {number}
	 * @memberof Counters
	 */
	@IsDefined()
	@IsInt()
	@Min(0)
	@Max(Counters.MaxCollectionIntervalMs)
	public readonly collectionIntervalMs: number;

	/**
	 * whether we should include parent of the pid in the process that we are tracking. Including parent implies
	 * we track all of the parent's children and not just the process designated by {@link pid}
	 *
	 * @type {boolean}
	 * @memberof Counters
	 */
	@IsNotEmpty()
	@IsBoolean()
	public readonly includeParent: boolean;


	/**
	 * whether we should dump the counters to file identified by the name of the counter.
	 *
	 * @type {boolean}
	 * @memberof Counters
	 */
	@IsNotEmpty()
	@IsBoolean()
	public readonly includeMovingAverages: boolean;

	// Scheme for moving averages. 
	@IsNotEmpty()
	@IsBoolean()
	public readonly dumpToFile: boolean;

	/**
	 * whether we should dump the counters to charts identified by the name of the counter. 
	 *
	 * @type {boolean}
	 * @memberof Counters
	 */
	@IsNotEmpty()
	@IsBoolean()
	public readonly dumpToChart: boolean;


	/**
	 * Name of this counter. This is used to identify all generated files.
	 *
	 * @type {string}
	 * @memberof Counters
	 */
	@IsString()
	@IsNotEmpty()
	@Matches(/[a-z0-9_]/i, 'i')
	public readonly name: string;

	/**
	 * directory where to dump files and charts. default is process's cwd.
	 *
	 * @type {string}
	 * @memberof Counters
	 */
	@IsString()
	@IsNotEmpty()
	public readonly outputDirectory: string;

	/**
	 * the collection of counters for this object corresponding to {@link pid}, and {@link includeParent}
	 *
	 * @type {Map<number,ProcessStatisticsCollection>}
	 * @memberof Counters
	 */
	public collection: Map<number, ProcessStatisticsCollection> = new Map<number, ProcessStatisticsCollection>();

	/**
	 * the simple moving average over 4 elements of {@link collection} of counters for this object corresponding to {@link pid}, and {@link includeParent}
	 *
	 * @type {Map<number,ProcessStatisticsCollection>}
	 * @memberof Counters
	 */
	public smaOver4Collection: Map<number, ProcessStatisticsCollection> = new Map<number, ProcessStatisticsCollection>();

	/**
	 * the exponential moving average over 4 elements of {@link collection} of counters for this object corresponding to {@link pid}, and {@link includeParent}
	 *
	 * @type {Map<number,ProcessStatisticsCollection>}
	 * @memberof Counters
	 */
	public emaOver4Collection: Map<number, ProcessStatisticsCollection> = new Map<number, ProcessStatisticsCollection>();

	/**
	 * the computed statistics on the collected results. These are consistent with the number we need to submit to performance frameworks for baselining the results.
	 *
	 * @type ComputedStatistics}
	 * @memberof Counters
	 */
	public computedStatistics: ComputedStatistics;

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
	constructor(name: string, pid: number = process.pid, includeParent: boolean = true, { collectionIntervalMs: collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory }: CountersOptions = {}) {
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
		let validationErrors: ValidationError[] = validateSync(this);
		if (validationErrors.length > 0) {
			trace(`throwing validationErrors::${jsonDump(validationErrors)}`);
			throw validationErrors;
		}

		trace(`default properties this object after construction: this.name=${this.name}, this.pid=${this.pid}, this.includeParent=${this.includeParent}, this.collectionIntervalMs=${this.collectionIntervalMs}, this.includeMovingAverages=${this.includeMovingAverages}, this.dumpToFile=${this.dumpToFile}, this.dumpToChart=${this.dumpToChart}, this.outputDirectory=${this.outputDirectory}`);
	}

	/**
	 * This method starts the data collection. It stops any previous ongoing collection on this object before starting this one. See {@link stop} for more details on what the stop method does.
	 */
	public async start(): Promise<void> {
		//stop collection first in case it is already in progress. This is inferred by in progress(defined) timers
		//
		if (this.countersTimer || this.processesToTrackTimer) {
			await this.stop();
		}
		await this.startPopulatingProcessInfos();
		await this.startCollecting();
	}

	/**
	 * This method stops the data collection. 
	 * If {@link includeMovingAverages} was set then it populates the moving average data.
	 * If {@link dumpToFile} was set then it dumps the collected data to files.
	 * If {@link dumpToChart} was set then it dumps out charts corresponding to the data collected.
	 */
	public async stop(): Promise<void> {
		await this.stopPopulatingProcessInfos();
		await this.stopCollecting();
		pidusage.clear();
		const promises: Promise<void>[] = [];

		await this.computeTotals();

		if (this.includeMovingAverages) {
			await this.computeMovingAverages();
		}

		// We now write out a bunch of files. These are for the data collected, the process information for which we collected
		// the data, the moving averages of the data, the statistical computations (ComputedStatistics) on the data, 
		// the charts for all data and the moving averages. Since these are all quite independent tasks all based off the data that we collected
		// and since all are being written to separate files we start them all in parallel and then wait for all of them to complete.
		promises.push(this.computeAndWriteStatistics());
		if (this.dumpToFile) {
			promises.push(this.writeCollectionData());
			promises.push(writeFileWithPromise(`${this.getOutputFileNameForProcess()}_processInfo.json`, jsonDump(this.processesToTrack)));
		}
		if (this.dumpToChart) {
			promises.push(this.writeCharts());
		}
		await Promise.all(promises);
	}

	private async writeCharts(): Promise<void> {
		const trace = require('debug')(`${logPrefix}:writeCharts:trace`);
		let promises: Promise<void>[] = [];
		[Counters.WholeComputerProcessInfo, Counters.TotalsProcessInfo, ...this.processesToTrack].forEach((proc: ProcessInfo) => {
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
		await Promise.all(promises);
	}

	private async writeChart(file: string, processCollection: ProcessStatisticsCollection): Promise<void> {
		const trace = require('debug')(`${logPrefix}:writeChart:trace`);
		trace(`processStats=${jsonDump(processCollection)}`);
		const xKey = 'timestamp';
		const xData: number[] = processCollection[xKey];
		const xAxisLabel = `${xKey}(${ProcessStatisticsUnits[xKey]})`;
		const lines: LineData[] = [];
		const title = path.parse(file).name; //get just file name without directory paths and extension
		Object.keys(processCollection)
			.filter(key => key !== 'elapsed' && key !== 'timestamp' && key !== 'pid' && key !== 'ppid')
			.forEach(key => {
				lines.push({
					label: `${key}(${ProcessStatisticsUnits[key]})`,
					data: processCollection[key]
				});
			});
		trace(`xData:${jsonDump(xData)}, lines:${jsonDump(lines)}, xAxisLabel: ${xAxisLabel}, file:${file}, title:${title}`);
		await writeChartToFile(xData, lines, 'png', processCollection.timestamp[0], xAxisLabel, file, title);
	}

	private async writeCollectionData(): Promise<void> {
		// data, simple moving average data and exponential moving average data are all written to different files
		// so we kick them all off and then wait for all of them to complete.
		let promises: Promise<void>[] = [];
		let file = `${this.getOutputFileName()}_data.json`;
		promises.push(writeFileWithPromise(file, jsonDump(this.collection)));
		if (this.includeMovingAverages) {
			file = `${this.getOutputFileName()}_sma_data.json`;
			promises.push(writeFileWithPromise(file, jsonDump(this.smaOver4Collection)));
			file = `${this.getOutputFileName()}_ema_data.json`;
			promises.push(writeFileWithPromise(file, jsonDump(this.emaOver4Collection)));
		}
		await Promise.all(promises);
	}


	private getOutputFileNameForProcess(proc: ProcessInfo = undefined): string {
		let file: string = this.getOutputFileName();
		if (proc) {
			file = proc.pid > 0 ? `${file}__${proc.name}_${proc.pid}` : `${file}__${proc.name}`;
		}
		return file.replace('.', '_');
	}

	private getOutputFileName(): string {
		return path.join(this.outputDirectory, this.name);
	}

	/**
	 * This method resets this object. It stops any ongoing collection as well as clears any collected data.
	 */
	public async reset(): Promise<void> {
		await this.stop();
		this.collection.clear();
		this.smaOver4Collection.clear();
		this.emaOver4Collection.clear();
	}

	//processes to track for counters  
	private processesToTrack: ProcessInfo[] = [];

	// timer for updating processesToTrack in case the process at the root of {@link pid} has changed.
	private processesToTrackTimer: NodeJS.Timer = null;

	// timer for collecting the statistics of the  processes that we are tracking.
	private countersTimer: NodeJS.Timer = null;

	// Promise for updating processesToTrack in case the process at the root of {@link pid} has changed.
	private processesToTrackUpdatePromise: Promise<void> = null;

	// Promise for collecting the statistics of the  processes that we are tracking.
	private countersCollectionPromise: Promise<void> = null;

	// flag for updating processesToTrack in case the process at the root of {@link pid} has changed.
	private processesToTrackUpdateInProgress: boolean = false;

	// flag for collecting the statistics of the  processes that we are tracking.
	private countersCollectionInProgress: boolean = false;

	private async stopPopulatingProcessInfos(): Promise<void> {
		clearInterval(this.processesToTrackTimer);
		if (this.processesToTrackTimer) {
			this.processesToTrackTimer.unref();
			this.processesToTrackTimer = null;
		}
		await this.processesToTrackUpdatePromise;

	}

	private async stopCollecting(): Promise<void> {
		await this.countersCollectionPromise;
		clearInterval(this.countersTimer);
		if (this.countersTimer) {
			this.countersTimer.unref();
			this.countersTimer = null;
		}
		await this.countersCollectionPromise;
	}

	private async startPopulatingProcessInfos(): Promise<void> {
		assert(this.processesToTrackTimer === null, `the processesToTrackTimer should be null when we startPopulatingProcessInfos`);
		const getProcessInfos = async () => {
			// start updating processesToTrack unless previous update is still in progress.
			if (!this.processesToTrackUpdateInProgress) {
				debug(`getting current processInfo for ${this.name}`)
				this.processesToTrackUpdateInProgress = true;
				this.processesToTrack = await getChildrenTree(this.pid, this.includeParent);
				this.processesToTrackUpdateInProgress = false;
			}
		};
		// kickoff the collection of processes to track and await 
		// them to be collected for the first time so that processesToTrack is initialized
		this.processesToTrackUpdatePromise = getProcessInfos();
		await this.processesToTrackUpdatePromise; //if we do not await here we will start trying to collect the perf counters when we have not yet figured what full set of processes to track, so we await here for all the processes to be tracked to become available.
		// set a timer to keep getting processes to track at regular intervals.
		this.processesToTrackTimer = setInterval(() => {
			if (!this.processesToTrackUpdateInProgress) {
				this.processesToTrackUpdatePromise = getProcessInfos();
			}
		}, Counters.ProcessInfoUpdateIntervalMs);
	}

	private async startCollecting(): Promise<void> {
		assert(this.countersTimer === null, `the countersTimer should be null when we startCollecting`);
		const collectCounters = async () => {
			const trace = require('debug')(`${logPrefix}:collectCounters:${this.name}:trace`);
			// start collecting counters unless previous collection set is still in progress.
			if (!this.countersCollectionInProgress) {
				trace(`${Date.now()}:: collecting counters for ${this.name}`);
				this.countersCollectionInProgress = true;
				const cs: ProcessStatistics = {
					cpu: (osu.cpu.average()).avgTotal,
					memory: os.totalmem() - os.freemem(),
					ppid: Counters.WholeComputerProcessInfo.ppid,
					pid: Counters.WholeComputerProcessInfo.pid,
					elapsed: os.uptime() * 1000,
					timestamp: Date.now()
				};
				[cs, ...await this.getCounters()].forEach(processStatistics => {
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
		};
		// Kickoff the first collection
		this.countersCollectionPromise = collectCounters();
		// Set a timer for future collections
		this.countersTimer = setInterval(() => {
			if (!this.countersCollectionInProgress) {
				this.countersCollectionPromise = collectCounters();
			}
		}, this.collectionIntervalMs);
	}


	private async computeTotals(): Promise<void> {
		const trace = require('debug')(`${logPrefix}:computeTotals:trace`);
		// Totals are stored in a record corresponding to {@link Counters.TotalsProcessInfo}
		trace(`collection: ${jsonDump(this.collection)}`);
		trace(`collection.keys: ${jsonDump(Object.keys(this.collection))}`);
		trace(`this.collection: ${jsonDump(this.collection)}`);
		trace("this.pid:", this.pid);
		this.collection[Counters.TotalsProcessInfo.pid] = {
			cpu: [],
			memory: [],
			ppid: Counters.TotalsProcessInfo.ppid,
			pid: Counters.TotalsProcessInfo.pid,
			ctime: [],
			elapsed: this.collection[this.pid].elapsed, // elapsed time are same across all process so just refer to the one for the current process.
			timestamp: this.collection[this.pid].timestamp, // timestamps  are same across all process so just refer to the one for the current process.
		};
		// compute and store totals for each timestamp value. 
		for (let i in this.collection[Counters.TotalsProcessInfo.pid].timestamp) {
			let cpu: number = 0;
			let memory: number = 0;
			let ctime: number = 0;
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
		trace(`this.collection[Counters.TotalsProcessInfo.pid]: ${jsonDump(this.collection[Counters.TotalsProcessInfo.pid])}`)
	}

	private async computeAndWriteStatistics(): Promise<void> {
		const totalsStats: ProcessStatisticsCollection = this.collection[-1];
		const datapoints: number = totalsStats.timestamp.length;
		let p95: number;
		let p90: number;
		let p50: number;
		[p50, p90, p95] = quantile(totalsStats.memory, [.5, .9, .95]);

		const computedStats: ComputedStatistics = {
			elapsedTime: totalsStats.elapsed[datapoints - 1] - totalsStats.elapsed[0],
			metricValue: p95,
			iterations: totalsStats.memory,
			ninetyfifthPercentile: p95,
			ninetiethPercentile: p90,
			fiftiethPercentile: p50,
			average: mean(totalsStats.memory),
			primaryMetric: 'MemoryMetric'
		};
		this.computedStatistics = computedStats;
		const file = `${this.getOutputFileNameForProcess()}_statistics.json`;
		await writeFileWithPromise(file, jsonDump(computedStats));
	}

	private async computeMovingAverages(): Promise<void> {
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
					this.smaOver4Collection[collectionStats.pid][prop] = sma([...this.collection[collectionStats.pid][prop]], 4).slice(3); //sma over '4' elements gives out an array of same size as input with first 3 elements values as nulls, so we prune them.
					this.emaOver4Collection[collectionStats.pid][prop] = ema([...this.collection[collectionStats.pid][prop]], 4);
				} else {
					//copy from corresponding collection while dropping the first 3 elements.Since moving averages produce values from 4th element
					//
					this.smaOver4Collection[collectionStats.pid][prop] = [...this.collection[collectionStats.pid][prop]].slice(3);
					this.emaOver4Collection[collectionStats.pid][prop] = [...this.collection[collectionStats.pid][prop]];
				}
			});
		};
	}

	private async getCounters(): Promise<ProcessStatistics[]> {
		const processStatistics: any = await pidusage([...this.processesToTrack.map(p => p.pid)]);
		return [...Object.values<ProcessStatistics>(processStatistics)];
	}

	private static getDumpToFile(input?: boolean | string): boolean {
		return getBoolean(input,
			getBoolean(process.env.CountersDumpToFile, DefaultCountersOptions.dumpToFile));
	}

	private static getDumpToChart(input?: boolean | string): boolean {
		return getBoolean(input,
			getBoolean(process.env.CountersDumpToChart, DefaultCountersOptions.dumpToChart));
	}

	private static getIncludeMovingAverages(input?: boolean | string): boolean {
		return getBoolean(input,
			getBoolean(process.env.CountersIncludeMovingAverages, DefaultCountersOptions.includeMovingAverages));
	}

	private static getCollectionInterval(input?: number): number {
		return nullNanUndefinedEmptyCoalesce(input,
			nullNanUndefinedEmptyCoalesce(parseInt(process.env.CountersCollectionIntervalMs), DefaultCountersOptions.collectionIntervalMs));
	}

	private static getOutputDirectory(input?: string): string {
		if (input) {
			return input;
		}
		if (process.env.CountersOutputDirectory) {
			return process.env.CountersOutputDirectory;
		}
		return DefaultCountersOptions.outputDirectory;
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
	public static async CollectPerfCounters(closureForCollection: () => void, name: string, pid: number = process.pid, includeParent: boolean = true, { collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory }: CountersOptions = {}): Promise<void> {
		const countersCollector = new Counters(name, pid, includeParent, { collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory });
		await countersCollector.start();
		await closureForCollection();
		await countersCollector.stop();
	}
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
 * @param {CountersOptions} [{ collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory }={}] - various options to influence collection behavior. See {@link CountersOptions} for details.
 * @returns {(target: any, memberName: string, memberDescriptor: PropertyDescriptor) => PropertyDescriptor} - returns the decorator method that is modified version of the method being decorated. 
 */
export function collectPerfCounters(name: string, pid: number = process.pid, includeParent: boolean = true, { collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory }: CountersOptions = {}): (target: any, memberName: string, memberDescriptor: PropertyDescriptor) => PropertyDescriptor {
	const debug = require('debug')(`${logPrefix}:collectPerfCounters`);
	// return the function that does the job of collecting the perf counters on an object instance method with decorator @collectPerfCounters
	//
	debug(`collectPerfCounters FactoryDecorator called with name=${name}, pid=${pid}, includeParent=${includeParent}, collectionIntervalMs=${collectionIntervalMs}, includeMovingAverages=${includeMovingAverages}, dumpToFile, dumpToChart, outputDirectory `);

	// The actual decorator function that modifies the original target method pointed to by the memberDescriptor
	//
	return function (target: any, memberName: string, memberDescriptor: PropertyDescriptor): PropertyDescriptor {
		// Collect Performance Counters for the 'memberName' function on the 'target' object pointed to by the memberDescriptor.value only if SuiteType is stress
		//
		debug(`Collecting Performance Counters for the method:"${memberName}" of class:${jsonDump(target.constructor.name)}`);
		// save a reference to the original method, this way we keep the values currently in the descriptor and not overwrite what another
		// decorator might have done to this descriptor by return the original descriptor.
		//
		const originalMethod: Function = memberDescriptor.value;
		//modifying the descriptor's value parameter to point to a new method which is the collects the performance counters while executing the originalMethod
		//
		memberDescriptor.value = async function (...args: any[]): Promise<any> {
			// note usage of originalMethod here
			//
			await Counters.CollectPerfCounters(async () => {
				await originalMethod.apply(this, args);
			}, name, pid, includeParent, { collectionIntervalMs, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory });
		};

		// return the original descriptor unedited.
		// the method pointed to by this descriptor was modified to a performance collecting version of the originalMethod.
		//
		return memberDescriptor;
	};
}