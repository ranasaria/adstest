/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This module contains all the definitions for Counters decorators and the utility functions and definitions thereof
*/
import { Min, Max, IsInt, validateSync, ValidationError, IsDefined, IsString, IsNotEmpty, IsAlphanumeric, IsBoolean } from 'class-validator';
import { jsonDump, nullNanUndefinedEmptyCoalesce, getBoolean, ProcessInfo, getChildrenTree } from './utils';
import { isString, promisify } from 'util';
import path = require('path');
import fs = require('fs');
import os = require('os');
import osu = require('node-os-utils');
import * as pidusage from 'pidusage';
import assert = require('assert');
import { ma as sma, ema } from 'moving-averages';
import { mean, quantile} from 'simple-statistics';
const writeFileAsync = promisify(fs.writeFile);


const logPrefix = 'adstest:counters';

/**
 * Subclass of Error to wrap any Error objects caught during Counters Execution.
 */
export class CountersError extends Error {
	inner: Error | any;
	static code: string = 'ERR_COUNTERS';

	constructor(error?: any) {
		super();
		this.name = CountersError.code;
		this.inner = error;
		if (error instanceof Error) {
			this.message = error.message;
			this.stack = error.stack;
		} else if (error instanceof String) {
			this.message = error.valueOf();
			try {
				throw new Error();
			} catch (e) {
				this.stack = e.stack;
			}
		} else if (isString(error)) {
			this.message = error;
			try {
				throw new Error();
			} catch (e) {
				this.stack = e.stack;
			}
		} else {
			this.message = 'unknown counters error';
		}
	}
}

/**
 *
 *
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
export interface ProcessStatistics {
	cpu: number[];
	memory: number[];
	ppid: number;
	pid: number;
	ctime?: number[];
	elapsed: number[];
	timestamp: number[];
}

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
export const DefaultCountersOptions: CountersOptions = { collectionInterval: 200, includeMovingAverages: true, dumpToFile: true, dumpToChart: true, outputDirectory: `${process.cwd()}` };

/**
 * A class with methods that help to implement the counters-ify decorator.
 * Keeping the core logic of counters-ification in one place as well as allowing this code to use
 * other decorators if needed.
 */
export class Counters {
	static readonly MaxCollectionInterval = 3600 * 1000; // in ms. MaxValue is 1 hour.
	static readonly ProcessInfoUpdationInterval = 10 * 1000; // 10 milliseconds. It takes 2-4 seconds to gather process information typically, so this value should not be lower than 5 seconds.

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
	 * whether we should include parent of the pid in the process that we are tracking. Including parent implies
	 * we track all of the parent's children and not just the process designameted by {@link pid}
	 *
	 * @type {boolean}
	 * @memberof Counters
	 */
	@IsDefined()
	@IsInt()
	@Min(0)
	public readonly includeParent: boolean;


	/**
	 * Number of milliseconds interval at which to collect the data.
	 *
	 * @type {number}
	 * @memberof Counters
	 */
	@IsDefined()
	@IsInt()
	@Min(0)
	@Max(Counters.MaxCollectionInterval)
	public readonly collectionInterval: number;


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
	@IsAlphanumeric()
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
	 * @type {Map<number,ProcessStatistics>}
	 * @memberof Counters
	 */
	public collection: Map<number, ProcessStatistics> = new Map<number, ProcessStatistics>();

	/**
	 * the simple moving average over 4 elements of {@link collection} of counters for this object corresponding to {@link pid}, and {@link includeParent}
	 *
	 * @type {Map<number,ProcessStatistics>}
	 * @memberof Counters
	 */
	public smaOver4Collection: Map<number, ProcessStatistics> = new Map<number, ProcessStatistics>();

	/**
	 * the exponential moving average over 4 elements of {@link collection} of counters for this object corresponding to {@link pid}, and {@link includeParent}
	 *
	 * @type {Map<number,ProcessStatistics>}
	 * @memberof Counters
	 */
	public emaOver4Collection: Map<number, ProcessStatistics> = new Map<number, ProcessStatistics>();
	
	/**
	 * the computed statistics on the collected results. These are consistent with the number we need to submit to peformance frameworks for baselining the results.
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
	  * @param includeParent - flag to indicate if we should include parent of the pid in the process that we are tracking. Including parent implies we track all of the parent's children and not just the process designameted by {@link pid}
	  * @param object of @type {CountersOptions} with:
			* @param collectionInterval - see {@link CountersOptions}.
			* @param includeMovingAverages - see {@link CountersOptions}.
			* @param dumpToFile - see {@link CountersOptions}.
			* @param dumpToChart - see {@link CountersOptions}.
			* @param outputDirectory - see {@link CountersOptions}. 
	  */
	constructor(name: string, pid: number = process.pid, includeParent: boolean = true, { collectionInterval: collectionInterval, includeMovingAverages, dumpToFile, dumpToChart, outputDirectory }: CountersOptions = {}) {
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
		let validationErrors: ValidationError[] = validateSync(this);
		if (validationErrors.length > 0) {
			trace(`throwing validationErrors::${jsonDump(validationErrors)}`);
			throw validationErrors;
		}

		trace(`default properties this object after construction: this.name=${this.name}, this.pid=${this.pid}, this.includeParent=${this.includeParent}, this.collectionInterval=${this.collectionInterval}, this.includeMovingAverages=${this.includeMovingAverages}, this.dumpToFile=${this.dumpToFile}, this.dumpToChart=${this.dumpToChart}, this.outputDirectory=${this.outputDirectory}`);
	}

	/**
	 * This method starts the data collection. It stops any previous ongoing collection on this object before starting this one. See {@link stop} for more details on what the stop method does.
	 */
	public async start(): Promise<void> {
		//stop collection first in case it is already in progress
		//
		this.stop();
		const promises: Promise<void>[] = [];
		promises.push(this.startPopulatingProcessInfos());
		promises.push(this.startCollecting());
		await Promise.all(promises);
	}

	/**
	 * This method stops the data collection. 
	 * If {@link includeMovingAverages} was set then it populates the moving average data.
	 * If {@link dumpToFile} was set then it dumps the collected data to files.
	 * If {@link dumpToChart} was set then it dumps out charts correspoinding to the data collected.
	 */
	public async stop(): Promise<void> {
		this.stopPopulatingProcessInfos();
		this.stopCollecting();
		pidusage.clear();
		this.processesToTrackTimer = null;
		this.countersTimer = null;
		const promises: Promise<void>[] = [];

		if (this.includeMovingAverages) {
			await this.computeMovingAverages();
		}
		await this.computeTotals();
		await this.computePublishStatistics();
		if (this.dumpToFile) {
			promises.push(this.writeCollectionData());
			promises.push(this.writeProcessesInfos());
		}
		if (this.dumpToChart) {
			promises.push(this.writeCharts());
		}
		await Promise.all(promises);
	}

	private async writeProcessesInfos(): Promise<void> {
		let promises: Promise<void>[] = [];
		this.processesToTrack.forEach((proc: ProcessInfo) => {
			let file = `${this.getFileNamePrefix(proc)}_processInfo.json`;
			promises.push(writeFileAsync(file, jsonDump(proc)));
		});
		await Promise.all(promises);
	}

	private async writeCharts(): Promise<void> {
		throw new Error("Method not implemented.");
	}

	private async writeCollectionData(): Promise<void> {
		let promises: Promise<void>[] = [];
		this.processesToTrack.forEach((proc: ProcessInfo) => {
			let file = `${this.getFileNamePrefix(proc)}_data.json`;
			promises.push(writeFileAsync(file, jsonDump(this.collection[proc.pid])));
			if (this.includeMovingAverages) {
				file = `${this.getFileNamePrefix(proc)}_sma_data.json`;
				promises.push(writeFileAsync(file, jsonDump(this.smaOver4Collection[proc.pid])));
				file = `${this.getFileNamePrefix(proc)}_ema_data.json`;
				promises.push(writeFileAsync(file, jsonDump(this.emaOver4Collection[proc.pid])));				
			}
		});
		await Promise.all(promises);
	}


	private getFileNamePrefix(proc: ProcessInfo): string {
		return path.join(this.outputDirectory, `${proc.name}_${proc.pid}`.replace('.', '_'));
	}

	/**
	 * This method resets this object. It stops any ongoing collection as well as clears any collected data.
	 */
	public reset(): void {
		this.stop();
		this.collection.clear();
		this.smaOver4Collection.clear();
		this.emaOver4Collection.clear();
	}

	//processes to track for counters  
	private processesToTrack: ProcessInfo[] = [];

	// timer for udating processesToTrack in case the process at the root of {@link pid} has changed.
	private processesToTrackTimer: NodeJS.Timer = null;

	// timer for collecting the statistics of the  processes that we are tracking.
	private countersTimer: NodeJS.Timer = null;

	private stopPopulatingProcessInfos(): void {
		clearInterval(this.processesToTrackTimer);
		this.processesToTrackTimer.unref();
	}
	private stopCollecting(): void {
		clearInterval(this.countersTimer);
		this.processesToTrackTimer.unref();
	}

	private async startPopulatingProcessInfos(): Promise<void> {
		assert(this.processesToTrackTimer === null, `the processesToTrackTimer should be null when we startPopulatingProcessInfos`);
		this.processesToTrackTimer = setInterval(async () => {
			this.processesToTrack = await getChildrenTree(this.pid, this.includeParent);
		}, Counters.ProcessInfoUpdationInterval);
	}

	private async startCollecting(): Promise<void> {
		assert(this.countersTimer === null, `the countersTimer should be null when we startCollecting`);
		this.countersTimer = setInterval(async () => {
			const cs: ProcessStatistics = {
				cpu: (osu.cpu.average()).avgTotal,
				memory: [os.totalmem() - os.freemem()],
				ppid: undefined,
				pid: 0,
				elapsed: [os.uptime() * 1000], //os.uptime is in seconds and elapsed is in ms.
				timestamp: [Date.now()]
			};
			[cs, ...await this.getCounters()].forEach(counterStats => {
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
		}, this.collectionInterval);
	}


	private async computeTotals(): Promise<void> {
		// Totals are stored in a record with pid and ppid of -1.
		this.collection[-1] = {
			cpu: [],
			memory: [],
			ppid: -1,
			pid: -1,
			ctime: [],
			elapsed: this.collection[this.pid].elapsed, // elapsed time are same across all process so just refer to the one for the current process.
			timestamp: this.collection[this.pid].timestamp, // timestamps  are same across all process so just refer to the one for the current process.
		};
		for ( let i in this.collection[this.pid].timestamp) {
			let cpu: number = 0;
			let memory: number = 0;
			let ctime: number = 0;
			this.processesToTrack.filter(proc => proc.pid > 0).forEach(proc => {
				cpu += this.collection[proc.pid].cpu[i];
				memory += this.collection[proc.pid].memory[i];
				ctime += this.collection[proc.pid].ctime[i];				
			});
			this.collection[this.pid].cpu[i] = cpu;
			this.collection[this.pid].memory[i] = memory;
			this.collection[this.pid].ctime[i] = ctime;
		}
	}

	private async computePublishStatistics(): Promise<void> {

		const totalsStats: ProcessStatistics = this.collection[-1];
		const datapoints: number = totalsStats.timestamp.length;
		let p95:number;
		let p90:number;
		let p50:number;
		[p50, p90, p95] = quantile(totalsStats.memory, [.5, .9, .95]);
		const computedStats: ComputedStatistics = {
			elapsedTime: totalsStats.elapsed[datapoints -1] - totalsStats.elapsed[0],
			metricValue: p95,
			iterations: totalsStats.memory,
			ninetyfifthPercentile: p95,			
			ninetiethPercentile: p90,
			fiftiethPercentile: p50,
			average: mean(totalsStats.memory),
			primaryMetric: 'MemoryMetric'
		}	
		this.computedStatistics = computedStats;
	}	
	
	private async computeMovingAverages(): Promise<void> {

		for ( let collectionStats of this.collection.values()) {
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
					this.smaOver4Collection[collectionStats.pid][prop] = sma([...this.collection[collectionStats.pid][prop]], 4);
					this.emaOver4Collection[collectionStats.pid][prop] = ema([...this.collection[collectionStats.pid][prop]], 4);					
				} else {
					//copy from corresponding collection while dropping the first 3 elements.Since moving averages produce values from 4th element
					//
					this.smaOver4Collection[collectionStats.pid][prop] = [...this.collection[collectionStats.pid][prop]].slice(3); 
					this.emaOver4Collection[collectionStats.pid][prop] = this.smaOver4Collection[collectionStats.pid][prop]; //refer to the same array as in sma collection as the contents are always same.
				}
			});
		};
	}

	private async getCounters(): Promise<ProcessStatistics[]> {
		return [...await pidusage(this.processesToTrack.map(p => p.pid))];
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
			nullNanUndefinedEmptyCoalesce(parseInt(process.env.CountersCollectionInterval), DefaultCountersOptions.collectionInterval));
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
}