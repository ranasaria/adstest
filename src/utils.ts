/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const debug = require('debug')('adstest:utils');
const trace = require('debug')('adstest:utils:trace');
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
* This simulates a sleep where the thread is suspended without spinning for a given number of milliseconds before resuming
*/
export async function sleep(ms: number) {
	return await (async () => {
		return await new Promise((undefined) => setTimeout(undefined, ms));
	})();
}

/**
* This is just a synonym for sleep(0). This has the affect of yielding to other operations.
*/
export async function bear() {
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
function toCapitalizedCase(inputString: string): string {
	if (null !== inputString && undefined !== inputString) {
		return inputString.toLowerCase().replace(/^.|\s\S/g, (a: string) => a.toUpperCase());
	}
	return inputString;
}