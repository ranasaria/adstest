/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { ValidationError } from 'class-validator';
import 'mocha';
import { DefaultStressOptions, Stress, stressify, StressOptions, StressResult } from '../stress';
import { bear, sleep, jsonDump, runOnCodeLoad, getBoolean } from '../utils';
import assert = require('assert');
import { AssertionError } from 'assert';
import tmp = require('tmp');
import rmfr = require('rmfr');

const debug = require('debug')('unittest:stress');
const trace = require('debug')('unittest:stress:trace');

interface StressParamType {
	environmentVariableName: string,
	stressOptionName: string,
	tooLow: number,
	tooHigh: number,
	valid: number,
	invalid: string
};

class StressifyTester {
	static dop: number = 10;
	static iter: number = 2000;
	static runtime: number = 0.05; //seconds

	t: number = 0;
	f: number = 0;
	e: number = 0;

	@runOnCodeLoad(StressifyTester.prototype.setenvironmentVariableiableSuiteType, 'Stress')
	setenvironmentVariableiableSuiteType(suiteType: string): void {
		process.env.SuiteType = suiteType;
		debug(`environment variable SuiteType set to ${process.env.SuiteType}`);
	}

	@stressify({ dop: StressifyTester.dop, iterations: StressifyTester.iter, passThreshold: 1 })
	async basicTest(): Promise<any> {
		await bear();	// yield to other operations.
		this.t++;
	}

	@stressify({ dop: StressifyTester.dop, iterations: StressifyTester.iter, passThreshold: 0 })
	async testStressStats(): Promise<any> {
		await this.failedErroredExecutions();
	}

	@stressify({ dop: StressifyTester.dop, iterations: StressifyTester.iter, passThreshold: 0.88 })
	async passThresholdFailed(): Promise<any> {
		await this.failedErroredExecutions();
	}

	@stressify({ dop: StressifyTester.dop, iterations: StressifyTester.iter, passThreshold: 0.5 })
	async passThresholdMet(): Promise<any> {
		await this.failedErroredExecutions();
	}

	private async failedErroredExecutions() {
		this.t++;
		if (this.t % 7 === 0) { //for every 7th invocation
			this.f++;
			assert.strictEqual(true, false, `failing the ${this.t}th invocation`);
		}
		else if (this.t % 11 === 0) { //for every 11th invocation
			this.e++;
			throw new Error(`Erroring out ${this.t}th invocation`);
		}
		await sleep(2); // sleep for 2 ms without spinning
	}

	@stressify({ runtime: StressifyTester.runtime, dop: StressifyTester.dop, iterations: Stress.MaxIterations, passThreshold: 1 }, false /* collectCounters */)
	async timeOutTest(): Promise<any> {
		await bear();	// yield to other operations.
		this.t++;
	}
}

function isIterable(obj: any): boolean {
	// Check https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Iteration_protocols for details on logic of this check
	// checks for null and undefined
	if (obj == null) {
	  return false;
	}
	return typeof obj[Symbol.iterator] === 'function';
}

suiteSetup('Stress automation setup', function () {
	var tmpObj = tmp.dirSync({ mode: 0o777, prefix: 'StressUnitTests_' });
	process.env.CountersOutputDirectory = tmpObj.name;
	debug('temp output directory', process.env.CountersOutputDirectory);
})

suiteTeardown('Stress automation cleanup', async function () {
	if (getBoolean(process.env.DontCleanupTestGeneratedFiles)) {
		debug(`process.env.DontCleanupTestGeneratedFiles is set to '${process.env.DontCleanupTestGeneratedFiles}', so skipping temporary files cleanup`);
	}
	else {
		debug(`process.env.DontCleanupTestGeneratedFiles is set to '${process.env.DontCleanupTestGeneratedFiles}', so cleaning up temporary files/directories generated by the tests`);
		await rmfr(process.env.CountersOutputDirectory);
	}
})

setup('Stress automation beforeEach Test Setup', function () {
	process.env.CountersCollectionIntervalMs = '10'; // collect every 10 milliseconds
})

teardown('Stress automation afterEach Test Cleanup', function () {
	delete process.env.CountersCollectionIntervalMs;
})

suite('Stress automation unit tests', function () {
	// set a higher timeout value
	const timeout: number = 500000;
	if (this.timeout() < timeout) {
		this.timeout(timeout); // increase timeout for each test to complete, when debug logging to console is turned out there can be considerable slow down.
	}

	//Environment Variable Tests
	//
	const absentValues = ['deleted', undefined, null, ''];
	let testId = 1;

	// Test values to verify StressOptions configured by environment variables and or constructor parameters
	//
	function getStressParams(): StressParamType[] {
		return [
			{
				environmentVariableName: 'StressRuntime',
				stressOptionName: 'runtime',
				tooLow: -0.1 / Math.random(),
				tooHigh: Stress.MaxRuntime + 0.1 / Math.random(),
				valid: Math.random() * Stress.MaxRuntime,
				invalid: 'abracadabra'
			},
			{
				environmentVariableName: 'StressDop',
				stressOptionName: 'dop',
				tooLow: Math.floor(-0.1 / Math.random()),
				tooHigh: Math.ceil(Stress.MaxDop + 0.1 / Math.random()),
				valid: Math.min(1, Math.floor(Math.random() * Stress.MaxDop)),
				invalid: 'abracadabra'
			},
			{
				environmentVariableName: 'StressIterations',
				stressOptionName: 'iterations',
				tooLow: Math.floor(-0.1 / Math.random()),
				tooHigh: Math.ceil(Stress.MaxIterations + 0.1 / Math.random()),
				valid: Math.floor(Math.random() * Stress.MaxIterations),
				invalid: 'abracadabra'
			},
			{
				environmentVariableName: 'StressPassThreshold',
				stressOptionName: 'passThreshold',
				tooLow: -0.1 / Math.random(),
				tooHigh: Stress.MaxPassThreshold + 0.1 / Math.random(),
				valid: Math.random() * Stress.MaxPassThreshold,
				invalid: 'abracadabra'
			}
		];
	}
	const stressParams: StressParamType[] = getStressParams();

	// Tests for environment variable corresponding to StressOptions not specified (absent)
	//
	stressParams.forEach(x => {
		[...absentValues, x.invalid].forEach(valueDim => {
			test(`environmentStressOption Test:${testId++}:: environmentVariable ${x.environmentVariableName} set to ##{${valueDim}}## should default to ${DefaultStressOptions[x.stressOptionName]}`, async function () {
				let origEnvironmentVariableValue: string = process.env[x.environmentVariableName];
				try {
					if (valueDim === 'deleted') {
						delete process.env[x.environmentVariableName];
						trace(`deleing env[${x.environmentVariableName}]`);
					} else {
						process.env[x.environmentVariableName] = valueDim;
						trace(`setting env[${x.environmentVariableName}] to: ${valueDim}`);
					}
					const actualOption = (new Stress())[x.stressOptionName];
					trace(`Actual ${x.stressOptionName} on a newly constructed Stress object evaluated to: ${actualOption}`);
					assert.equal(actualOption, DefaultStressOptions[x.stressOptionName]);
				}
				finally {
					process.env[x.environmentVariableName] = origEnvironmentVariableValue;
				}
			});
		});
	});

	// Tests for environment variable corresponding to StressOptions set to a invalid, too high or too low value
	//
	stressParams.forEach(x => {
		[x.tooLow, x.tooHigh].forEach(invalidValue => {
			test(`environmentStressOption Test:${testId++}:: environmentVariable ${x.environmentVariableName} set to ##{${invalidValue}}## should result in a ValidationError`, async function () {
				let origEnvironmentVariableValue: string = process.env[x.environmentVariableName];
				try {
					process.env[x.environmentVariableName] = invalidValue.toString();
					trace(`setting env[${x.environmentVariableName}] to: ${invalidValue}`);
					new Stress();
					assert(false, "The test did not throw when it was expected to");
				}
				catch (errors) {
					trace(`Exception caught:${errors}::${jsonDump(errors)}, each is being verified to be ValidationError type and is being swallowed`);
					if (isIterable(errors)) {
						[...errors].forEach(err => assert(err instanceof ValidationError));
					} else {
						assert(errors instanceof ValidationError);
					}
				}
				finally {
					process.env[x.environmentVariableName] = origEnvironmentVariableValue;
				}
			});
		});
	});

	// Tests for environment variable corresponding to StressOptions set to a valid value
	//
	stressParams.forEach(x => {
		[x.valid].forEach(validValue => {
			test(`environmentStressOption Test:${testId++}:: environmentVariable ${x.environmentVariableName} set to ##{${validValue}}## should set the created object's ${x.stressOptionName} property to ${validValue}`, async function () {
				let origEnvironmentVariableValue: string = process.env[x.environmentVariableName];
				try {
					process.env[x.environmentVariableName] = validValue.toString();
					trace(`setting env[${x.environmentVariableName}] to: ${validValue}`);
					const actualOption = (new Stress())[x.stressOptionName];
					trace(`Actual ${x.stressOptionName} on a newly constructed Stress object evaluated to: ${actualOption}`);
					assert.equal(actualOption, validValue);
				}
				finally {
					process.env[x.environmentVariableName] = origEnvironmentVariableValue;
				}
			});
		});
	});

	// Tests for passing null/empty, too high, too low or invalid value as StressOption paratmeter to Stress constructor
	//
	stressParams.forEach(x => {
		[...absentValues, x.tooLow, x.tooHigh, x.invalid].filter(s => s !== 'deleted').forEach(badValue => {
			test(`constructorStressOption Test:${testId++}:: constructor parameter ${x.stressOptionName} set to ##{${badValue}}## should result in a ValidationError`, async function () {
				try {
					let option: StressOptions = DefaultStressOptions;
					option[x.stressOptionName] = badValue;
					trace(`StressOptions object being passed to stress constructor is:${jsonDump(option)}`);
					trace(`Constructing a Stress object with constructor parameter ${x.stressOptionName} set to ##{${badValue}}##`);
					new Stress(option);
					assert(false, "The test did not throw when it was expected to");
				}
				catch (errors) {
					trace(`Exception caught:${errors}::${jsonDump(errors)}, each is being verified to be ValidationError type and is being swallowed`);
					if (isIterable(errors)) {
						[...errors].forEach(err => assert(err instanceof ValidationError));
					} else {
						assert(errors instanceof ValidationError);
					}
				}
			});
		});
	});

	// Tests for passing a valid value as StressOption parameter to Stress constructor
	// Corresponding environment variables are as set to random default valid values as well. These tests ensure that the values passed into
	// constructor are the ones that are finally set.
	//
	const environmentVariableValidValuesForStressOptions = getStressParams();
	trace(`environmentVariableValidValuesForStressOptions::${jsonDump(environmentVariableValidValuesForStressOptions)}`);
	stressParams.forEach(x => {
		test(`constructorStressOption Test:${testId++}:: constructor parameter ${x.stressOptionName} set to ##{${x.valid}}## should set the created object's ${x.stressOptionName} property to ${x.valid}`, async function () {
			const origEnvironmentValues = {};
			try {
				environmentVariableValidValuesForStressOptions.forEach(x => {
					trace(`saving origEnvironmentValues process.env[x.environmentVariableName]=${process.env[x.environmentVariableName]} in origEnvironmentValues[x.environmentVariableName]`);
					origEnvironmentValues[x.environmentVariableName] = process.env[x.environmentVariableName];
					trace(`origEnvironmentValues[x.environmentVariableName] is now ${origEnvironmentValues[x.environmentVariableName]}`);
					trace(`setting process.env[x.environmentVariableName] to ${x.valid}`);
					process.env[x.environmentVariableName] = x.valid.toString();
				});
				let option: StressOptions = { runtime: undefined, dop: undefined, iterations: undefined, passThreshold: undefined };
				option[x.stressOptionName] = x.valid;
				trace(`Constructing a Stress object with constructor parameter ${x.stressOptionName} set to ##{${x.valid}}##`);
				const actualOption = (new Stress(option))[x.stressOptionName];
				trace(`Actual ${x.stressOptionName} on a newly constructed Stress object evaluated to: ${actualOption}`);
				assert.equal(actualOption, x.valid);
			}
			finally {
				environmentVariableValidValuesForStressOptions.forEach(x => {
					process.env[x.environmentVariableName] = origEnvironmentValues[x.environmentVariableName];
				});
			}
		});
	});

	// Basic Positive test for canonical use case.
	//
	test(`Positive Test:${testId++}:: ensures multiple threads and iterations gets performed as expected`, async function () {
		debug('invoking basicTest()');
		const stressifier = new StressifyTester();
		let retVal: StressResult = await stressifier.basicTest();
		debug(`test basicTest done, total invocations=${stressifier.t}`);
		debug(`test retVal is ${jsonDump(retVal)}`);
		assert(retVal.numPasses === StressifyTester.dop * StressifyTester.iter, `total invocations should be ${StressifyTester.dop * StressifyTester.iter}`);
	});

	// Positive test to verify the error and fail counts returned are accurate.
	//
	test(`Positive Test:${testId++}:: verifies Pass, Fail, Error counts of stress execution`, async function () {
		debug('invoking testStressStats()');
		const stressifier = new StressifyTester();
		let retVal: StressResult = await stressifier.testStressStats();
		debug(`test testStressStats done, total invocations=${stressifier.t}`);
		debug(`test retVal is ${jsonDump(retVal)}`);
		assert(retVal.numPasses + retVal.fails.length + retVal.errors.length === StressifyTester.dop * StressifyTester.iter, `total invocations should be ${StressifyTester.dop * StressifyTester.iter}`);
		assert.equal(retVal.fails.length, stressifier.f, `Number of failures does not match the expected`);
		assert.equal(retVal.errors.length, stressifier.e, `Number of errors does not match the expected`);
	});

	// Positive test to verify that the passThreshold not exceeded results in a pass.
	//
	test(`Positive Test:${testId++}:: verifies passThreshold met does not result in error being thrown`, async function () {
		debug('invoking passThresholdMet()');
		let retVal:StressResult;
		const stressifier = new StressifyTester();			
		try {
			retVal = await stressifier.passThresholdMet();
			debug(`test passThresholdMet done, total invocations=${stressifier.t}`);
			debug(`test retVal is ${jsonDump(retVal)}`);
			assert(retVal.numPasses + retVal.fails.length + retVal.errors.length === StressifyTester.dop * StressifyTester.iter, `total invocations should be ${StressifyTester.dop * StressifyTester.iter}`);
			assert.equal(retVal.fails.length, stressifier.f, `Number of failures does not match the expected`);
			assert.equal(retVal.errors.length, stressifier.e, `Number of errors does not match the expected`);
		}
		catch (e) {
			debug(`error:${e}`);
			assert (false, `unexpected ${e} was thrown`);
		}
	});

	// Positive test to verify that the passThreshold not met results in an assertion.
	//
	test(`Positive Test:${testId++}:: verifies passThreshold failed does result in error being thrown`, async function () {
		const stressifier = new StressifyTester();
		try {
			debug('invoking passThresholdFailed()');
			await stressifier.passThresholdFailed();
			assert(false, "Error was not thrown when one was expected");
		}
		catch (err) {
			debug(`test passThresholdFailed done, total invocations=${stressifier.t}`);
			trace(`Exception caught:${err}::${jsonDump(err)}, each is being verified to be AssertionError type and is being swallowed`);
			assert(err instanceof AssertionError);
		}
	});

	// Verifies that timer fires to end the test when runTime expires and number of iterations are not up.
	//
	test(`Positive Test:${testId++}:: verifies that timer fires to end the test when runTime expires and number of iterations are not up.`, async function () {
		debug('invoking timerTest()');
		let timeOut: number = StressifyTester.runtime + 60000; //60 additional seconds beyond expiry of runtime.
		let timeOutExceeded: boolean = false;
		let testDone: boolean = false;
		// setup a timer to flag timeOutExceeded when we have waited for timeOut amount of time.
		// This test also asserts that the test is done when this timeout expires.
		//
		let timer: NodeJS.Timer = setTimeout(() => {
			timeOutExceeded = true;
			assert(testDone, `test was not done even after ${timeOut} seconds when runtime configured was ${StressifyTester.runtime} seconds`)
		}, timeOut);

		const stressifier = new StressifyTester();
		let retVal: StressResult = await stressifier.timeOutTest();
		testDone = true;
		clearTimeout(timer);
		timer.unref();
		debug(`test timeOutTest done, total invocations=${stressifier.t}`);
		debug(`test retVal is ${jsonDump(retVal)}`);
		assert(!timeOutExceeded, `timeOut of ${timeOut} seconds has been exceeded while executing the test and configured runtime  was: ${StressifyTester.runtime}`);
		assert(retVal.numPasses <= Stress.MaxIterations, `total invocations should less than ${Stress.MaxIterations}`);
	});
});
