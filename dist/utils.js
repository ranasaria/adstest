/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const pidusage = require("pidusage");
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
function runOnCodeLoad(func, ...args) {
    func.apply(this, args);
    return function (memberClass, memberName, memberDescriptor) {
        trace(`Decorator runOnCodeLoad called for function: ${memberName}, on object: ${exports.jsonDump(this)} with args: (${args.join(',')})`);
        return memberDescriptor;
    };
}
exports.runOnCodeLoad = runOnCodeLoad;
/**
 * Enumeration for various kinds of test suites that we support in our test system.
 */
var SuiteType;
(function (SuiteType) {
    // Please preserve the capitalized casing and list members in alphabetic order.
    //
    SuiteType["Integration"] = "Integration";
    SuiteType["Perf"] = "Perf";
    SuiteType["Stress"] = "Stress";
})(SuiteType = exports.SuiteType || (exports.SuiteType = {}));
/**
* This simulates a sleep where the thread is suspended without spinning for a given number
* of milliseconds before resuming
*/
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return (() => __awaiter(this, void 0, void 0, function* () {
            return yield new Promise((resolve) => setTimeout(resolve, ms));
        }))();
    });
}
exports.sleep = sleep;
/**
* This is just a synonym for sleep(0). This has the affect of yielding to other operations.
*/
function bear() {
    return __awaiter(this, void 0, void 0, function* () {
        return yield sleep(0);
    });
}
exports.bear = bear;
/**
 * gets the suiteType as defined by the environment variable {@link SuiteType}
 * @returns - returns a value of type {@link SuiteType}
 */
function getSuiteType() {
    let suite = null;
    debug(`process.env.SuiteType at when getSuiteType was called is: ${process.env.SuiteType}`);
    let suiteType = toCapitalizedCase(process.env.SuiteType);
    trace(`Capitalized suiteType is ${process.env.SuiteType}`);
    if (suiteType in SuiteType) {
        trace(`${process.env.SuiteType} is in SuiteType enumeration: ${JSON.stringify(SuiteType)}`);
        suite = SuiteType[suiteType];
        trace(`so return value of suiteType was set to ${JSON.stringify(suite)}`);
    }
    else {
        trace(`${process.env.SuiteType} is not in SuiteType enumeration: ${JSON.stringify(SuiteType)}`);
        suite = SuiteType.Integration;
        trace(`so return value of suiteType was set to ${JSON.stringify(suite)}`);
    }
    debug(`return suiteType is:${JSON.stringify(suite)}`);
    return suite;
}
exports.getSuiteType = getSuiteType;
/**
 * returns the pretty formatted JSON string for the {@link object} provided.
 * @param object the object to dump
 */
exports.jsonDump = (object) => JSON.stringify(object, undefined, '\t');
/**
 * returns a string in 'capitalized case' where first letter of every word is capital and all other letters are lowercase.
 * @param inputString - the string to be converted to capitalized case
 */
function toCapitalizedCase(inputString) {
    if (null !== inputString && undefined !== inputString) {
        return inputString.toLowerCase().replace(/^.|\s\S/g, (a) => a.toUpperCase());
    }
    return inputString;
}
exports.toCapitalizedCase = toCapitalizedCase;
/**
 * returns a number that is the {@link defaultValue} provided if the {@link value} input parameter is either null, or NaN or undefined or 'empty' string.
 * else returns the {@link value} input parameter
 * There are cases where the transpile js code from typescript code will allow the strings to be passed through and hence the last check for empty string.
 * @param value - the input value to check for being null, undefined, NaN or empty. If it is not any of those then {@link value} is returned else {@link defaultValue} is returned.
 * @param defaultValue - the value to return if the input is null, undefined, NaN or empty.
 */
function nullNanUndefinedEmptyCoalesce(value, defaultValue) {
    return (value === null || value === undefined || isNaN(value) || value.toString() === '') ? defaultValue : value;
}
exports.nullNanUndefinedEmptyCoalesce = nullNanUndefinedEmptyCoalesce;
/**
 * returns a booelean that is the {@link defaultValue} provided if the {@link value} input parameter is either null, or undefined.
 * else it returns true if the input string is (case insensitive) "true", "1", "on", or "yes"
 * @param value - the input value to check for trueness. If it is (case insensitive) "true", "1", "on", or "yes" then true is returned, else {@link defaultValue} is returned if it is null or undefined else false is returned.
 * @param defaultValue - the value to return if the input is null, or undefined.
 */
function getBoolean(value, defaultValue) {
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
exports.getBoolean = getBoolean;
/**
 * returns the parent PID of the given {@link pid}
 * @param pid - the PID whose parent PID needs to be returned.
 * @param processesList - optional cached list of ProcessInfo object in which to search for parents. If ommited then system process list is searched.
 */
function getParentPid(pid = process.pid, processesList = null) {
    return __awaiter(this, void 0, void 0, function* () {
        const debugPrefix = `${tracePrefix}:getParentPid`;
        const debug = debugLogger(`${debugPrefix}`);
        const trace = debugLogger(`${debugPrefix}:trace`);
        trace("processPid:", pid);
        const parentProcessInfo = yield getParent(pid, processesList);
        let parentPid = parentProcessInfo.ppid;
        if (parentPid === undefined || parentPid === null || parentPid === NaN) {
            debug(`invalid pid:<${pid}> on matched parent process for given pid:<${pid}>. parent process object: ${exports.jsonDump(parentProcessInfo)}`);
            throw new Error(`invalid pid:<${pid}> on matched parent process for given pid:<${pid}>. parent process object: ${exports.jsonDump(parentProcessInfo)}`);
        }
        trace("parentPid:", parentPid);
        return parentPid;
    });
}
exports.getParentPid = getParentPid;
exports.getProcessList = () => __awaiter(this, void 0, void 0, function* () {
    const fp = require('find-process');
    const processes = yield fp('name', /.*/); //get all processes
    return processes;
});
/**
 * returns the parent ProcessInfo object of the given {@link pid}
 * @param pid - the pid for which the parent object needs to be returned
 * @param processesList - optional cached list of ProcessInfo object in which to search for parents. If ommited then system process list is searched.
 */
function getParent(pid, processesList = null) {
    return __awaiter(this, void 0, void 0, function* () {
        const debugPrefix = `${tracePrefix}:getParent`;
        const debug = debugLogger(`${debugPrefix}`);
        const trace = debugLogger(`${debugPrefix}:trace`);
        if (processesList === undefined || processesList === null) {
            processesList = yield exports.getProcessList();
        }
        trace(`undefined:${exports.jsonDump(undefined)}`);
        const processes = processesList.filter(ps => ps.pid === pid);
        if (processes.length !== 1) {
            debug(`unexpected number of processes matching pid:<${pid}> found. processes found:${exports.jsonDump(processes)}`);
            throw new Error(`unexpected number of processes matching pid:<${pid}> found. processes found:${exports.jsonDump(processes)}`);
        }
        const parentProcessInfo = processes[0];
        if (parentProcessInfo === undefined || parentProcessInfo === null) {
            debug(`no process matching pid:<${pid}> found. processes found:${exports.jsonDump(processes)}`);
            throw new Error(`no process matching pid:<${pid}> found. processes found:${exports.jsonDump(processes)}`);
        }
        return parentProcessInfo;
    });
}
exports.getParent = getParent;
/**
 * returns an array of ProcessInfo objects which are within the children subtree of the given process. The subtree contains ProcessInfo objects rescursively corresponding input {@link inputPid}, its children pids, its grandchildren pids and so on.
 * @param inputPid - returns an array of ProcessInfo objects rescursively corresponding this pid, its children pids, its grandchildren pids and so on.
 * @param processesList - optional cached list of ProcessInfo object in which to search for parents. If ommited then system process list is searched.
 * @param getTreeForParent - if true we get children subtree of {@link inputPid}'s parent. If the parent is the process id 0 then this option is ignored.
 */
function getChildrenTree(inputPid = process.pid, getTreeForParent = true, processesList = null) {
    return __awaiter(this, void 0, void 0, function* () {
        const debugPrefix = `${tracePrefix}:getChildrenTree`;
        const debug = debugLogger(`${debugPrefix}`);
        const trace = debugLogger(`${debugPrefix}:trace`);
        trace("input pid:", inputPid);
        if (inputPid === undefined || inputPid === null || isNaN(inputPid)) {
            throw new Error(`Invalid pid:<${inputPid}>`);
        }
        if (processesList === undefined || processesList === null) {
            trace(`getting process list`);
            processesList = yield exports.getProcessList();
            trace(`Done getting process list`);
        }
        if (getTreeForParent) {
            const ppid = yield getParentPid(inputPid, processesList);
            if (ppid !== 0) {
                trace(`given inputPid:<${inputPid}>'s parent is:<${ppid}> and getTreeForParent is <${getTreeForParent}>, so getting its process info subtree`);
                inputPid = ppid;
            }
        }
        const childrenMap = new Array(); // we use array instead of maps for performance and we can as our keys are integers.
        let processForInputPid = undefined;
        processesList.forEach(p => {
            if (childrenMap[p.ppid]) {
                childrenMap[p.ppid].push(p);
            }
            else {
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
        const childrenList = [];
        const toProcess = [processForInputPid]; //start with inputProcess as a toProcess List
        trace("toProcess:", exports.jsonDump(toProcess));
        let p = null;
        const pendingPromises = [];
        while (p = toProcess.pop()) {
            childrenList.push(p);
            // if (populateCommandLine) {
            // 	pendingPromises.push(setCommandLine(p));
            // }
            trace(`p:${exports.jsonDump(p)}`);
            const childrenOfP = childrenMap[p.pid];
            trace("childrenOfP:", childrenOfP);
            if (childrenOfP !== undefined && childrenOfP !== null) {
                childrenOfP.forEach(c => toProcess.push(c));
            }
            //toProcess.push(...childrenOfP); //add all nodes that are children of process 'p' to the 'toProcess' list.
        }
        yield Promise.all(pendingPromises); //wait for all pending promises to finish
        trace("childrenTree:", exports.jsonDump(childrenList));
        return childrenList;
    });
}
exports.getChildrenTree = getChildrenTree;
/**
 *
 */
function getCounters(processesToTrack) {
    return __awaiter(this, void 0, void 0, function* () {
        return [...yield pidusage(processesToTrack.map(p => p.pid))];
    });
}
exports.getCounters = getCounters;
/**
 * returns a random string that has {@link length} number of characters.
 * @param length
 */
function randomString(length = 8) {
    // ~~ is double bitwise not operator which is a faster substitute for Math.floor() for positive numbers.
    //	Techinically ~~ just removes everything to the right of decimal point.
    //
    return [...Array(length)].map(i => (~~(Math.random() * 36)).toString(36)).join('');
}
exports.randomString = randomString;
//# sourceMappingURL=utils.js.map