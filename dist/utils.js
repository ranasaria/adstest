"use strict";
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
const debug = require('debug')('adstest:utils');
const trace = require('debug')('adstest:utils:trace');
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
* This simulates a sleep where the thread is suspended without spinning for a given number of milliseconds before resuming
*/
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield (() => __awaiter(this, void 0, void 0, function* () {
            return yield new Promise((undefined) => setTimeout(undefined, ms));
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
//# sourceMappingURL=utils.js.map