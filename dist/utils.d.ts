/**
 * decorator function to run some code at decorator load time before other code is evaluated. Invoke the {@link func} method with given {@link args}
 * 		and then return a decorator function that does not modify the method for which it is called.
 * @param func - the {@link Function} to be invoked at load time.
 * @param args - the argument array to be passed as parameters to the {@link func}.
 */
export declare function runOnCodeLoad(func: Function, ...args: any[]): (memberClass: any, memberName: string, memberDescriptor: PropertyDescriptor) => PropertyDescriptor;
/**
 * Enumeration for various kinds of test suites that we support in our test system.
 */
export declare enum SuiteType {
    Integration = "Integration",
    Perf = "Perf",
    Stress = "Stress"
}
/**
* This simulates a sleep where the thread is suspended without spinning for a given number
* of milliseconds before resuming
*/
export declare function sleep(ms: number): Promise<any>;
/**
* This is just a synonym for sleep(0). This has the affect of yielding to other operations.
*/
export declare function bear(): Promise<any>;
/**
 * gets the suiteType as defined by the environment variable {@link SuiteType}
 * @returns - returns a value of type {@link SuiteType}
 */
export declare function getSuiteType(): SuiteType;
/**
 * returns the pretty formatted JSON string for the {@link object} provided.
 * @param object the object to dump
 */
export declare const jsonDump: (object: any) => string;
/**
 * returns a string in 'capitalized case' where first letter of every word is capital and all other letters are lowercase.
 * @param inputString - the string to be converted to capitalized case
 */
export declare function toCapitalizedCase(inputString: string): string;
/**
 * returns a number that is the {@link defaultValue} provided if the {@link value} input parameter is either null, or NaN or undefined or 'empty' string.
 * else returns the {@link value} input parameter
 * There are cases where the transpiled javascript code from typescript code will allow the strings to be passed through and hence the last check for empty string.
 * @param value - the input value to check for being null, undefined, NaN or empty. If it is not any of those then {@link value} is returned else {@link defaultValue} is returned.
 * @param defaultValue - the value to return if the input is null, undefined, NaN or empty.
 */
export declare function nullNanUndefinedEmptyCoalesce(value: number, defaultValue: number): number;
/**
 * returns a boolean that is the {@link defaultValue} provided if the {@link value} input parameter is either null, or undefined.
 * else it returns true if the input string is (case insensitive) "true", "1", "on", or "yes"
 * @param value - the input value to check for trueness. If it is (case insensitive) "true", "1", "on", or "yes" then true is returned, else {@link defaultValue} is returned if it is null or undefined else false is returned.
 * @param defaultValue - the value to return if the input is null, or undefined. If not specified then 'false' is assumed.
 */
export declare function getBoolean(value: boolean | string, defaultValue?: boolean): boolean;
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
export declare function getParentPid(pid?: number, processesList?: ProcessInfo[]): Promise<number>;
export declare const getProcessList: () => Promise<ProcessInfo[]>;
/**
 * returns the parent ProcessInfo object of the given {@link pid}
 * @param pid - the pid for which the parent object needs to be returned
 * @param processesList - optional cached list of ProcessInfo object in which to search for parents. If omitted then system process list is searched.
 */
export declare function getParent(pid: number, processesList?: ProcessInfo[]): Promise<ProcessInfo>;
/**
 * returns an array of ProcessInfo objects which are within the children subtree of the given process. The subtree contains ProcessInfo objects recursively corresponding input {@link inputPid}, its children pids, its grandchildren pids and so on.
 * @param inputPid - returns an array of ProcessInfo objects recursively corresponding this pid, its children pids, its grandchildren pids and so on.
 * @param processesList - optional cached list of ProcessInfo object in which to search for parents. If omitted then system process list is searched.
 * @param getTreeForParent - if true we get children subtree of {@link inputPid}'s parent. If the parent is the process id 0 then this option is ignored.
 */
export declare function getChildrenTree(inputPid?: number, getTreeForParent?: boolean, processesList?: ProcessInfo[]): Promise<Array<ProcessInfo>>;
/**
 *
 */
export declare function getCounters(processesToTrack: ProcessInfo[]): Promise<ProcessStats[]>;
/**
 * returns a random string that has {@link length} number of characters.
 * @param length - specifies the length of the random string generated.
 */
export declare function randomString(length?: number): string;
/**
 * returns a date time string corresponding the input parameter {@link msSinceEpoch}
 *
 * @export
 * @param {*} msSinceEpoch - provides the input time in terms of milliseconds since Unix epoch time which is 00:00:00 UTC on 1 January 1970
 * @returns a string representation of the input timestamp
 */
export declare function toDateTimeString(msSinceEpoch?: number): string;
