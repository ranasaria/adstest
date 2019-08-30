/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import * as pidusage from 'pidusage';
const debugLogger = require('debug');
const tracePrefix = 'adstest:utils';
const debug = debugLogger(tracePrefix);
const trace = debugLogger(`${tracePrefix}:trace`);

/**
 * decorator function to run some code at decorator load time before other code is evaluated. Invoke the {@link func} method with given {@link args}
 * 		and then return a decorator function that does not modify the method for which it is called.
 * @param func - the {@link Function} to be invoked at load time.
 * @param args - the argument array to be passed as parameters to the {@link func}.
 */
export function runOnCodeLoad(func: Function, ...args): (memberClass: any, memberName: string, memberDescriptor: PropertyDescriptor) => PropertyDescriptor {
	func.apply(this, args);
	return function (memberClass: any, memberName: string, memberDescriptor: PropertyDescriptor): PropertyDescriptor {
		trace(`Decorator runOnCodeLoad called for function: ${memberName}, on object: ${jsonDump(this)} with args: (${args.join(',')})`);
		return memberDescriptor;
	};
}

/**
 * Enumeration for various kinds of test suites that we support in our test system.
 */
export enum SuiteType {
	// Please preserve the capitalized casing and list members in alphabetic order.
	//
	Integration = 'Integration',
	Perf = 'Perf',
	Stress = 'Stress',
}


/**
* This simulates a sleep where the thread is suspended without spinning for a given number 
* of milliseconds before resuming
*/
export async function sleep(ms: number): Promise<any> {
	return (async () => {
		return await new Promise((resolve) => setTimeout(resolve, ms));
	})();
}
/**
* This is just a synonym for sleep(0). This has the affect of yielding to other operations.
*/
export async function bear(): Promise<any> {
	return await sleep(0);
}

/**
 * gets the suiteType as defined by the environment variable {@link SuiteType}
 * @returns - returns a value of type {@link SuiteType}
 */
export function getSuiteType(): SuiteType {
	let suite: SuiteType = null;
	debug(`process.env.SuiteType at when getSuiteType was called is: ${process.env.SuiteType}`);
	let suiteType: string = toCapitalizedCase(process.env.SuiteType);
	trace(`Capitalized suiteType is ${process.env.SuiteType}`);
	if (suiteType in SuiteType) {
		trace(`${process.env.SuiteType} is in SuiteType enumeration: ${JSON.stringify(SuiteType)}`);
		suite = SuiteType[suiteType];
		trace(`so return value of suiteType was set to ${JSON.stringify(suite)}`);
	} else {
		trace(`${process.env.SuiteType} is not in SuiteType enumeration: ${JSON.stringify(SuiteType)}`);
		suite = SuiteType.Integration;
		trace(`so return value of suiteType was set to ${JSON.stringify(suite)}`);
	}
	debug(`return suiteType is:${JSON.stringify(suite)}`);
	return suite;
}

/**
 * returns the pretty formatted JSON string for the {@link object} provided.
 * @param object the object to dump
 */
export const jsonDump = (object: any): string => JSON.stringify(object, undefined, '\t');

/**
 * returns a string in 'capitalized case' where first letter of every word is capital and all other letters are lowercase.
 * @param inputString - the string to be converted to capitalized case
 */
export function toCapitalizedCase(inputString: string): string {
	if (null !== inputString && undefined !== inputString) {
		return inputString.toLowerCase().replace(/^.|\s\S/g, (a: string) => a.toUpperCase());
	}
	return inputString;
}

/**
 * returns a number that is the {@link defaultValue} provided if the {@link value} input parameter is either null, or NaN or undefined or 'empty' string.
 * else returns the {@link value} input parameter
 * There are cases where the transpiled javascript code from typescript code will allow the strings to be passed through and hence the last check for empty string.
 * @param value - the input value to check for being null, undefined, NaN or empty. If it is not any of those then {@link value} is returned else {@link defaultValue} is returned.
 * @param defaultValue - the value to return if the input is null, undefined, NaN or empty.
 */
export function nullNanUndefinedEmptyCoalesce(value: number, defaultValue: number): number {
	return (value === null || value === undefined || isNaN(value) || value.toString() === '') ? defaultValue : value;
}

/**
 * returns a boolean that is the {@link defaultValue} provided if the {@link value} input parameter is either null, or undefined.
 * else it returns true if the input string is (case insensitive) "true", "1", "on", or "yes"
 * @param value - the input value to check for trueness. If it is (case insensitive) "true", "1", "on", or "yes" then true is returned, else {@link defaultValue} is returned if it is null or undefined else false is returned.
 * @param defaultValue - the value to return if the input is null, or undefined. If not specified then 'false' is assumed.
 */
export function getBoolean(value: boolean | string, defaultValue: boolean = false): boolean {
	if (value === undefined || value === null) {
		return defaultValue;
	}
	switch (value.toString().toLowerCase()) {
		case "true":
		case "1":
		case "on":
		case "yes":
			return true;
		default:
			return false;
	}
}

/**
 * Defines an interface to collect the counters for a given process or for the whole system
 *
 * @export
 * @interface CounterStats
 * @param cpu - percentage (from 0 to 100*vcore).
 * @param memory - bytes used by the process.
 * @param ppid - parent process id. undefined for system stats. -1 for totals record for totals record for all the tracked processes.
 * @param pid - process id. primary key. 0 for system stats. -1 for totals record for all the tracked processes.
 * @param ctime - ms user + system time.
 * @param elapsed - ms since the start, of the process/test/system depending on context.
 * @param timestamp - ms since epoch.
 */
export interface ProcessStats {
	cpu: number[];
	memory: number[];
	ppid: number;
	pid: number;
	ctime?: number[];
	elapsed: number[];
	timestamp: number[];
}

/**
 * Defines an interface to track the process information of various processes running on the system 
 */
export interface ProcessInfo {
	pid: number;
	ppid: number;
	name: string;
	bin?: string;
	cmd?: string;
}

/**
 * returns the parent PID of the given {@link pid}
 * @param pid - the PID whose parent PID needs to be returned.
 * @param processesList - optional cached list of ProcessInfo object in which to search for parents. If omitted then system process list is searched.
 */
export async function getParentPid(pid: number = process.pid, processesList: ProcessInfo[] = null): Promise<number> {
	const debugPrefix: string = `${tracePrefix}:getParentPid`;
	const debug = debugLogger(`${debugPrefix}`);
	const trace = debugLogger(`${debugPrefix}:trace`);
	trace("processPid:", pid);
	const parentProcessInfo: ProcessInfo = await getParent(pid, processesList);
	let parentPid: number = parentProcessInfo.ppid;
	if (parentPid === undefined || parentPid === null || parentPid === NaN) {
		debug(`invalid pid:<${pid}> on matched parent process for given pid:<${pid}>. parent process object: ${jsonDump(parentProcessInfo)}`);
		throw new Error(`invalid pid:<${pid}> on matched parent process for given pid:<${pid}>. parent process object: ${jsonDump(parentProcessInfo)}`);
	}
	trace("parentPid:", parentPid);
	return parentPid;
}

export const getProcessList = async (): Promise<ProcessInfo[]> => {
	const fp = require('find-process');
	const processes: ProcessInfo[] = await fp('name', /.*/); //get all processes
	return processes;
}


/**
 * returns the parent ProcessInfo object of the given {@link pid}
 * @param pid - the pid for which the parent object needs to be returned
 * @param processesList - optional cached list of ProcessInfo object in which to search for parents. If omitted then system process list is searched.
 */
export async function getParent(pid: number, processesList: ProcessInfo[] = null): Promise<ProcessInfo> {
	const debugPrefix: string = `${tracePrefix}:getParent`;
	const debug = debugLogger(`${debugPrefix}`);
	const trace = debugLogger(`${debugPrefix}:trace`);
	if (processesList === undefined || processesList === null) {
		processesList = await getProcessList();
	}
	trace(`undefined:${jsonDump(undefined)}`);
	const processes: Array<ProcessInfo> = processesList.filter(ps => ps.pid === pid);
	if (processes.length !== 1) {
		debug(`unexpected number of processes matching pid:<${pid}> found. processes found:${jsonDump(processes)}`);
		throw new Error(`unexpected number of processes matching pid:<${pid}> found. processes found:${jsonDump(processes)}`);
	}
	const parentProcessInfo = processes[0];
	if (parentProcessInfo === undefined || parentProcessInfo === null) {
		debug(`no process matching pid:<${pid}> found. processes found:${jsonDump(processes)}`);
		throw new Error(`no process matching pid:<${pid}> found. processes found:${jsonDump(processes)}`);
	}
	return parentProcessInfo;
}

/**
 * returns an array of ProcessInfo objects which are within the children subtree of the given process. The subtree contains ProcessInfo objects recursively corresponding input {@link inputPid}, its children pids, its grandchildren pids and so on. 
 * @param inputPid - returns an array of ProcessInfo objects recursively corresponding this pid, its children pids, its grandchildren pids and so on.
 * @param processesList - optional cached list of ProcessInfo object in which to search for parents. If omitted then system process list is searched.
 * @param getTreeForParent - if true we get children subtree of {@link inputPid}'s parent. If the parent is the process id 0 then this option is ignored.
 */
export async function getChildrenTree(inputPid: number = process.pid, getTreeForParent: boolean = true, processesList: ProcessInfo[] = null): Promise<Array<ProcessInfo>> {
	const debugPrefix: string = `${tracePrefix}:getChildrenTree`;
	const debug = debugLogger(`${debugPrefix}`);
	const trace = debugLogger(`${debugPrefix}:trace`);
	trace("input pid:", inputPid);
	if (inputPid === undefined || inputPid === null || isNaN(inputPid)) {
		throw new Error(`Invalid pid:<${inputPid}>`);
	}
	if (processesList === undefined || processesList === null) {
		trace(`getting process list`);
		processesList = await getProcessList();
		trace(`Done getting process list`);
	}
	if (getTreeForParent) {
		const ppid = await getParentPid(inputPid, processesList);
		if (ppid !== 0) {
			trace(`given inputPid:<${inputPid}>'s parent is:<${ppid}> and getTreeForParent is <${getTreeForParent}>, so getting its process info subtree`);
			inputPid = ppid;
		}
	}

	const childrenMap: Array<ProcessInfo[]> = new Array<ProcessInfo[]>(); // we use array instead of maps for performance and we can as our keys are integers.
	let processForInputPid: ProcessInfo = undefined;
	processesList.forEach(p => {
		if (childrenMap[p.ppid]) {
			childrenMap[p.ppid].push(p);
		} else {
			childrenMap[p.ppid] = [p];
		}
		if (inputPid == p.pid) {
			processForInputPid = p;
			trace("processInfo for inputPid (or its parent if parent tree was requested) :", processForInputPid);
		}
	});

	if (processForInputPid === undefined || processForInputPid === null) {
		debug(`No process found for the inputPid:${inputPid}`);
		throw new Error(`No process found for the inputPid:${inputPid}`);
	}
	const childrenList: ProcessInfo[] = [];
	const toProcess: ProcessInfo[] = [processForInputPid]; //start with inputProcess as a toProcess List
	trace("toProcess:", jsonDump(toProcess));
	let p: ProcessInfo = null;
	const pendingPromises: Promise<any>[] = [];
	while (p = toProcess.pop()) {
		childrenList.push(p);
		trace(`p:${jsonDump(p)}`);
		const childrenOfP: ProcessInfo[] = childrenMap[p.pid];
		trace("childrenOfP:", childrenOfP);
		if (childrenOfP !== undefined && childrenOfP !== null) {
			childrenOfP.forEach(c => toProcess.push(c));
		}
	}
	await Promise.all(pendingPromises); //wait for all pending promises to finish
	trace("childrenTree:", jsonDump(childrenList));
	return childrenList;
}

/**
 * 
 */
export async function getCounters(processesToTrack: ProcessInfo[]): Promise<ProcessStats[]> {
	return [...await pidusage(processesToTrack.map(p => p.pid))];
}

/**
 * returns a random string that has {@link length} number of characters.
 * @param length - specifies the length of the random string generated.
 */
export function randomString(length: number = 8): string {
	// ~~ is double bitwise not operator which is a faster substitute for Math.floor() for positive numbers.
	//	Technically ~~ just removes everything to the right of decimal point.
	//
	return [...Array(length)].map(i => (~~(Math.random() * 36)).toString(36)).join('');
}

/**
 * returns a date time string corresponding the input parameter {@link msSinceEpoch}
 *
 * @export
 * @param {*} msSinceEpoch - provides the input time in terms of milliseconds since Unix epoch time which is 00:00:00 UTC on 1 January 1970
 * @returns a string representation of the input timestamp
 */
export function toDateTimeString(msSinceEpoch: number = 0): string {
	const a = new Date(msSinceEpoch);
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const year = a.getFullYear();
	const month = months[a.getMonth()];
	const date = a.getDate();
	const hour = a.getHours();
	const min = a.getMinutes();
	const sec = a.getSeconds();
	const msec = a.getMilliseconds();
	const time = `${date}-${month}-${year} ${hour}:${min}:${sec}.${("00" + msec).substr(-3)}`;
	return time;
}