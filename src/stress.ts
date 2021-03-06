/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This module contains all the definitions for Stress decorators and the utility functions and definitions thereof
*/
'use strict';

import { IsDefined, IsInt, Max, Min, ValidationError, validateSync } from 'class-validator';
import { SuiteType, bear, getSuiteType, jsonDump, nullNanUndefinedEmptyCoalesce } from './utils';

import { AssertionError } from 'assert';
import { Counters } from './counters';
import { isString } from 'util';

import assert = require('assert');

import debugLogger = require('debug');

const logPrefix = 'adstest:stress';
const trace = debugLogger(`${logPrefix}:trace`);

/**
 * Subclass of Error to wrap any Error objects caught during Stress Execution.
 */
export class StressError extends Error {
	inner: Error | any;
	static code: string = 'ERR_STRESS';

	constructor(error?: any) {
		super();
		this.name = StressError.code;
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
			this.message = 'unknown stress error';
		}
	}
}

/**
 * Defines an interface to specify the stress options for stress tests.
 * @param runtime - the number of seconds (fractional values are allowed, least count is 1 millisecond) for which the stress runs. Once this 'runtime' expires stress is terminated even if we have not exceeded {@link iterations} count yet. Default value is provided by environment variable: StressRuntime and if undefined then by {@link DefaultStressOptions}.
 * @param dop - the number of parallel instances of the decorated method to run. Default value is provided by environment variable: StressDop and if undefined then by {@link DefaultStressOptions}.
 * @param iterations - the number of iterations to run in each parallel invocation for the decorated method. {@link runtime} can limit the number of iterations actually run. Default value is provided by environment variable: StressIterations and if undefined then by {@link DefaultStressOptions}.
 * @param passThreshold - the fractional number of all invocations of the decorated method that must pass to declared the stress invocation of that method to be declared passed. Range: 0.0-1.0. Default value is provided by environment variable: StressPassThreshold and if undefined then by {@link DefaultStressOptions}.
 */

export interface StressOptions {
	runtime?: number;
	dop?: number;
	iterations?: number;
	passThreshold?: number;
}

/**
 * The default values for StressOptions.
 */
export const DefaultStressOptions: StressOptions = { runtime: 7200, dop: 4, iterations: 50, passThreshold: 0.95 };

/**
 * Defines the shape of stress result object
 */
export interface StressResult {
	numPasses: number;
	fails: Error[];
	errors: Error[];
}

/**
 * A class with methods that help to implement the stressify decorator.
 * Keeping the core logic of `stressification` in one place as well as allowing this code to use
 * other decorators if needed.
 */
export class Stress {
	static readonly MaxIterations = 1000000;
	static readonly MaxRuntime = 72000;
	static readonly MaxDop = 40;
	static readonly MaxPassThreshold = 1;

	// Number of iterations.
	@IsDefined()
	@IsInt()
	@Min(0)
	@Max(Stress.MaxIterations)
	readonly iterations?: number;

	// Seconds. Fractional values are allowed.
	@IsDefined()
	@Min(0)
	@Max(Stress.MaxRuntime)
	readonly runtime?: number;

	// Degree of parallelism
	@IsDefined()
	@IsInt()
	@Min(1)
	@Max(Stress.MaxDop)
	readonly dop?: number;

	// Threshold for fractional number of individual test passes to total executed to declare the stress test passed. This is a fraction between 0 and Stress.MaxPassThreshold.
	@IsDefined()
	@Min(0)
	@Max(Stress.MaxPassThreshold)
	readonly passThreshold?: number;


	/**
	 * Constructor allows for construction with a bunch of optional parameters
	 *
	 * @param runtime - see {@link StressOptions}.
	 * @param dop - see {@link StressOptions}.
	 * @param iterations - see {@link StressOptions}.
	 * @param passThreshold - see {@link StressOptions}.
	 */
	constructor({ runtime, dop, iterations, passThreshold }: StressOptions = {}) {
		const debug = require('debug')(`${logPrefix}:constructor`);
		const trace = require('debug')(`${logPrefix}:constructor:trace`);
		trace(`parameters: runtime=${runtime}, dop=${dop}, iterations=${iterations}, passThreshold=${passThreshold}`);
		trace(`default properties this object at beginning of constructor: this.runtime=${this.runtime}, this.dop=${this.dop}, this.iterations=${this.iterations}, this.passThreshold=${this.passThreshold}`);
		this.runtime = Stress.getRuntime(runtime);
		this.dop = Stress.getDop(dop);
		this.iterations = Stress.getIterations(iterations);
		this.passThreshold = Stress.getPassThreshold(passThreshold);

		// validate this object
		//
		let validationErrors: ValidationError[] = validateSync(this);
		if (validationErrors.length > 0) {
			debug(`throwing validationErrors::${jsonDump(validationErrors)}`);
			throw validationErrors;
		}

		trace(`properties of this object post full construction with given parameters are: this.runtime=${this.runtime}, this.dop=${this.dop}, this.iterations=${this.iterations}, this.passThreshold=${this.passThreshold}`);
	}

	private static getPassThreshold(input?: number): number {
		return nullNanUndefinedEmptyCoalesce(input,
			nullNanUndefinedEmptyCoalesce(parseFloat(process.env.StressPassThreshold), DefaultStressOptions.passThreshold));
	}

	private static getIterations(input?: number): number {
		return nullNanUndefinedEmptyCoalesce(input,
			nullNanUndefinedEmptyCoalesce(parseInt(process.env.StressIterations), DefaultStressOptions.iterations));
	}

	private static getDop(input?: number): number {
		return nullNanUndefinedEmptyCoalesce(input,
			nullNanUndefinedEmptyCoalesce(parseInt(process.env.StressDop), DefaultStressOptions.dop));
	}

	private static getRuntime(input?: number): number {
		return nullNanUndefinedEmptyCoalesce(input,
			nullNanUndefinedEmptyCoalesce(parseFloat(process.env.StressRuntime), DefaultStressOptions.runtime));
	}

	/**
	 *
	 * @param originalMethod - The reference to the originalMethod that is being stressfied.The name of this method is {@link functionName}
	 * @param originalObject - The reference to the object on which the {@link originalMethod} is invoked.
	 * @param functionName - The name of the originalMethod that is being stressfied.
	 * @param args - The invocation argument for the {@link originalMethod}
	 * @param runtime - The desconstructed {@link StressOptions} parameter. see {@link StressOptions} for details.
	 * @param dop - The desconstructed {@link StressOptions} parameter. see {@link StressOptions} for details.
	 * @param iterations - The desconstructed {@link StressOptions} parameter. see {@link StressOptions} for details.
	 * @param passThreshold - The desconstructed {@link StressOptions} parameter. see {@link StressOptions} for details.
	 *
	 * @returns - {@link StressResult}.
	 */
	async run(
		originalMethod: Function,
		originalObject: any,
		functionName: string,
		args: any[],
		{ runtime, dop, iterations, passThreshold }: StressOptions = {}
	): Promise<StressResult> {

		trace(`run method called with parameters: originalMethod=${jsonDump(originalMethod)} originalObject=${jsonDump(originalObject)} functionName=${functionName}  args=${jsonDump(args)}`);
		trace(`run method called with StressOptions: runtime=${runtime}, dop=${dop}, iterations=${iterations}, passThreshold=${passThreshold}`);
		runtime = nullNanUndefinedEmptyCoalesce(runtime, this.runtime);
		dop = nullNanUndefinedEmptyCoalesce(dop, this.dop);
		iterations = nullNanUndefinedEmptyCoalesce(iterations, this.iterations);
		passThreshold = nullNanUndefinedEmptyCoalesce(passThreshold, this.passThreshold);
		let numPasses: number = 0;
		let fails = [];
		let errors = [];

		let pendingPromises: Promise<void>[] = [];
		const debug = require('debug')(`${logPrefix}:${functionName}`);
		debug(`Running Stress on ${functionName} with args: ('${args.join('\',\'')}') with runtime=${runtime}, dop=${dop}, iterations=${iterations}, passThreshold=${passThreshold}`);
		let timedOut: boolean = false;

		// Setup a timer to set timedOut to true when this.runtime number of seconds have elapsed.
		//
		trace(`Setting up a timer to expire after runtime of ${runtime * 1000} milliseconds`);
		let timer: NodeJS.Timer = setTimeout(() => {
			timedOut = true;
			trace(`flagging time out. ${runtime} seconds are up`);
		}, runtime * 1000);

		const IterativeLoop = async (t: number) => {
			const debug = require('debug')(`${logPrefix}:${functionName}:thread-${t}`);
			for (let i = 0; i < iterations; i++) {
				debug(`starting iteration number: ${i}`);
				try {
					await originalMethod.apply(originalObject, args);
					debug(`iteration number=${i} passed`);
					numPasses++;
					bear(); // bear (yield) to other threads so that timeout timer gets a chance to fire.
					if (timedOut) {
						debug(`timed out after ${i}th iteration, timeout of ${runtime} has expired `);
						clearTimeout(timer);
						timer.unref();
						break; // break out of the loop
					}
				}
				catch (err) {
					// If failures can result in errors of other types apart from AssertionError then we will need to augument here
					//
					err instanceof AssertionError
						? fails.push(err)
						: errors.push(new StressError(err));
					console.warn(`warn: iteration number=${i} on thread-${t} failed/errored with error: ${err}`);
					debug(`iteration number=${i} failed/errored with error: ${err}`);
				}
			}
		};

		// Invoke the iterative loop defined above in parallel without awaiting each individually
		//
		for (let t = 0; t < dop; t++) {
			pendingPromises.push(IterativeLoop(t));
		}

		// Now await all of the Promises for each of the above invocation.
		//
		await Promise.all(pendingPromises).catch(fatalError => {
			debug(`A fatal error was encountered running stress thread: ${jsonDump(fatalError)}`);
			throw fatalError;
		});

		let total = numPasses + errors.length + fails.length;
		assert(numPasses >= passThreshold * total, `Call Stressified: ${functionName}(${args.join(',')}) failed with a expected pass percent of ${passThreshold * 100}, actual pass percent is: ${numPasses * 100 / total}`);
		return { numPasses: numPasses, fails: fails, errors: errors };
	}
}

// the singleton Stress object.
//
const stressor = new Stress();

/**
 * Decorator Factory to return a decorator function that will stressify any object instance's 'async' method.
 * 	Using the decorator factory allows us pass options to the decorator itself separately from the arguments
 * 	of the function being modified.
 *
 * @export
 * @param {StressOptions}: Stress options for Stress.
  	* @param runtime - The desconstructed {@link StressOptions} option. see {@link StressOptions} for details.
	* @param dop - The desconstructed {@link StressOptions} option. see {@link StressOptions} for details.
	* @param iterations - The desconstructed {@link StressOptions} option. see {@link StressOptions} for details.
	* @param passThreshold - The desconstructed {@link StressOptions} option. see {@link StressOptions} for details.
 * @param {boolean} [collectCounters=true] - if true we collect counters for this stress run.
 * @param {number} [rootPidForCounters=process.pid] - if specied we collect counters for all children recursively starting from this pid's parent.
 * @returns {(target: any, memberName: string, memberDescriptor: PropertyDescriptor) => PropertyDescriptor}
 */
export function stressify({ runtime, dop, iterations, passThreshold }: StressOptions = {}, collectCounters: boolean = true, rootPidForCounters: number = undefined): (target: any, memberName: string, memberDescriptor: PropertyDescriptor) => PropertyDescriptor {
	const debug = require('debug')(`${logPrefix}:stressify`);
	// return the function that does the job of stressifying a test class method with decorator @stressify
	//
	debug(`stressify FactoryDecorator called with runtime=${runtime}, dop=${dop}, iter=${iterations}, passThreshold=${passThreshold}`);

	// The actual decorator function that modifies the original target method pointed to by the memberDescriptor
	//
	return function (target: any, memberName: string, memberDescriptor: PropertyDescriptor): PropertyDescriptor {
		// stressify the 'memberName' function on the 'target' object pointed to by the memberDescriptor.value only if SuiteType is stress
		//
		const suiteType = getSuiteType();
		debug(`Stressified Decorator called for: ${memberName} and suiteType=${suiteType}`);
		if (suiteType === SuiteType.Stress) {
			debug(`Stressifying method:"${memberName}" of class:${jsonDump(target.constructor.name)} since env variable SuiteType is set to ${SuiteType.Stress}`);
			// save a reference to the original method, this way we keep the values currently in the descriptor and not overwrite what another
			// decorator might have done to this descriptor by return the original descriptor.
			//
			const originalMethod: Function = memberDescriptor.value;
			//modifying the descriptor's value parameter to point to a new method which is the `stressified` version of the originalMethod
			//
			memberDescriptor.value = async function (...args: any[]): Promise<StressResult> {
				// note usage of originalMethod here
				//
				let result: StressResult;
				if (collectCounters) {
					await Counters.CollectPerfCounters(async () => {
						result = await stressor.run(originalMethod, this, memberName, args, { runtime, dop, iterations, passThreshold });
					},
						`${target.constructor.name}_${memberName}`,
						getRootPid(rootPidForCounters)
					);
				} else {
					result = await stressor.run(originalMethod, this, memberName, args, { runtime, dop, iterations, passThreshold });
				}

				debug(`Stressified: ${memberName}(${args.join(',')}) returned: ${jsonDump(result)}`);
				return result;
			};
		}

		// return the original descriptor unedited.
		// the method pointed to by this descriptor was modified to a stressified version of the originalMethod if SuiteType was Stress.
		//
		return memberDescriptor;
	};
}

/**
 * returns the root pid for which to collect counters. if {@link inputPid} is defined and a valid number then that value is returned else the value
 * parsed from environment variable PerfPidForCollection is returned. If the environment variable value is also not a valid number then current process pid is returned.
 *
 * @param {number} inputPid - 
 * @returns {number}
 */
function getRootPid(inputPid: number): number {
	if (inputPid !== null && !isNaN(inputPid)) {
		return inputPid;
	}

	if (!process.env.PerfPidForCollection) {
		return process.pid;
	}
	const pid: number = parseInt(process.env.PerfPidForCollection);
	if (isNaN(pid)) {
		return process.pid;
	}
	return pid;
}