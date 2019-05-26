/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { ValidationError } from 'class-validator';
import 'mocha';
import { DefaultStressOptions, Stress, stressify, StressOptions, StressResult } from '../stress';
import { bear, getSuiteType, sleep, SuiteType, jsonDump } from '../utils';
import assert = require('assert');
import { AssertionError } from 'assert';

const debug = require('debug')('unittest:stress');
const trace = require('debug')('unittest:stress:trace');

/**
 * decorator function to run some code at decorator load time before other code is evaluated. Invoke the {@link func} method with given {@link args}
 * 		and then return a decorator function that does not modify the method for which it is called.
 * @param func - the {@link Function} to be invoked at load time.
 * @param args - the argument array to be passed as parameters to the {@link func}.
 */
function runOnCodeLoad(func: Function, ...args): (memberClass: any, memberName: string, memberDescriptor: PropertyDescriptor) => PropertyDescriptor {
	func.apply(this, args);
	return function (memberClass: any, memberName: string, memberDescriptor: PropertyDescriptor): PropertyDescriptor {
		trace(`Decorator runOnCodeLoad called for function: ${memberName}, on object: ${jsonDump(this)} with args: (${args.join(',')})`);
		return memberDescriptor;
	};
}


interface StressParamType {
	environmentVariableName: string,
	stressOptionName: string,
	tooLow: number,
	tooHigh: number,
	valid: number,
	invalid: string
};

class StressifyTester {
	static dop: number = 5;
	static iter: number = 6;
	static runtime: number = 0.05; //seconds

	t: number = 0;
	f: number = 0;
	e: number = 0;

	@runOnCodeLoad(StressifyTester.prototype.setenvironmentVariableiableSuiteType, 'Stress')
	setenvironmentVariableiableSuiteType(suiteType: string): void {
		process.env.SuiteType = suiteType;
		debug(`environment variable SuiteType set to ${process.env.SuiteType}`);
	}

	static randomString(length: number = 8): string {
		// ~~ is double bitwise not operator which is a faster substitute for Math.floor() for positive numbers.
		//	Techinically ~~ just removes everything to the right of decimal point.
		//
		return [...Array(length)].map(i => (~~(Math.random() * 36)).toString(36)).join('');
	}

	environmentVariableSuiteTypeTest(x: { 'environmentVariableValue': string, 'expected': SuiteType }): void {
		let environmentVariable = 'SuiteType';
		let origSuiteType: string = process.env[environmentVariable];
		try {
			if (x.environmentVariableValue === 'deleted') {
				delete process.env[environmentVariable];
				trace(`deleting env[${environmentVariable}]`);
			} else {
				process.env[environmentVariable] = x.environmentVariableValue;
				trace(`setting process.env[${environmentVariable}] to: ${x.environmentVariableValue}`);
			}
			const suiteType = getSuiteType();
			trace(`suiteType evaluated to: ${suiteType} by getSuiteType() function`);
			assert.equal(suiteType, x.expected);
		}
		finally {
			process.env.SuiteType = origSuiteType;
		}
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

	@stressify({ dop: StressifyTester.dop, iterations: StressifyTester.iter, passThreshold: 0.5 })
	async passThresholdMet(): Promise<any> {
		await this.failedErroredExecutions();
	}

	@stressify({ runtime: StressifyTester.runtime, dop: StressifyTester.dop, iterations: Stress.MaxIterations, passThreshold: 1 })
	async timeOutTest(): Promise<any> {
		await bear();	// yield to other operations.
		this.t++;
	}
}

suite('Stress automation unit tests', function () {
	//Environment Variable Tests
	//
	const absentValues = ['deleted', undefined, null, ''];
	let testId = 1;

	absentValues.forEach(valueDim => {
		test(`environmentVariable Test:${testId++}:: environmentVariable SuiteType is set to ##{${valueDim}}## should default to ${SuiteType.Integration}`, async function () {
			(new StressifyTester()).environmentVariableSuiteTypeTest({ 'environmentVariableValue': valueDim, 'expected': SuiteType.Integration });
		});
	});

	const envSuiteTypeTests = [
		{
			'testDescription': `environmentVariable Test:${testId++}::environmentVariable SuiteType set to random string which is not ${SuiteType.Stress} or ${SuiteType.Perf} should default to ${SuiteType.Integration}`,
			'environmentVariableValue': `${StressifyTester.randomString()}`,
			'expected': SuiteType.Integration
		},
		{
			'testDescription': `environmentVariable Test:${testId++}::environmentVariable SuiteType set to ${SuiteType.Stress} string should result in ${SuiteType.Stress}`,
			'environmentVariableValue': 'sTreSS', // Casing is mixed on purpose
			'expected': SuiteType.Stress
		},
		{
			'testDescription': `environmentVariable Test:${testId++}::environmentVariable SuiteType set to ${SuiteType.Stress} string should result in ${SuiteType.Perf}`,
			'environmentVariableValue': 'PErf', // Casing is mixed on purpose
			'expected': SuiteType.Perf
		},
	];

	envSuiteTypeTests.forEach(tst => {
		test(tst.testDescription, async function () {
			(new StressifyTester()).environmentVariableSuiteTypeTest(tst);
		});
	});

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
				valid: Math.floor(Math.random() * Stress.MaxDop),
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
					process.env[x.environmentVariableName] = invalidValue;
					trace(`setting env[${x.environmentVariableName}] to: ${invalidValue}`);
					new Stress();
					assert(false, "The test did not throw when it was expected to");
				}
				catch (errors) {
					trace(`Exception caught:${errors}::${jsonDump(errors)}, each is being verified to be ValidationError type and is being swallowed`);
					[...errors].forEach(err => assert(err instanceof ValidationError));
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
					process.env[x.environmentVariableName] = validValue;
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
					[...errors].forEach(err => assert(err instanceof ValidationError));
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
					process.env[x.environmentVariableName] = x.valid;
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
		assert.doesNotThrow(async () => {
			debug('invoking passThresholdMet()');
			const stressifier = new StressifyTester();
			let retVal: StressResult = await stressifier.passThresholdMet();
			debug(`test testStressStats done, total invocations=${stressifier.t}`);
			debug(`test retVal is ${jsonDump(retVal)}`);
			assert(retVal.numPasses + retVal.fails.length + retVal.errors.length === StressifyTester.dop * StressifyTester.iter, `total invocations should be ${StressifyTester.dop * StressifyTester.iter}`);
			assert.equal(retVal.fails.length, stressifier.f, `Number of failures does not match the expected`);
			assert.equal(retVal.errors.length, stressifier.e, `Number of errors does not match the expected`);
		}, `passThreshold should have been met and the test should have passed`);
	});

	// Positive test to verify that the passThreshold not met results in an assertion.
	//
	test(`Positive Test:${testId++}:: verifies passThreshold failed does result in error being thrown`, async function () {
		const stressifier = new StressifyTester();
		let retVal: StressResult;
		try {
			debug('invoking passThresholdFailed()');
			retVal = await stressifier.passThresholdFailed();
			assert(false, "Error was not thrown when one was expected");
		}
		catch (err) {
			debug(`test testStressStats done, total invocations=${stressifier.t}`);
			debug(`test retVal is ${jsonDump(retVal)}`);
			trace(`Exception caught:${err}::${jsonDump(err)}, each is being verified to be AssertionError type and is being swallowed`);
			assert(err instanceof AssertionError);
		}
	});

	// Verifies that timer fires to end the test when runTime expires and number of iterations are not up.
	//
	test(`Positive Test:${testId++}:: verifies that timer fires to end the test when runTime expires and number of iterations are not up.`, async function () {
		debug('invoking timerTest()');
		let timeOut: number = StressifyTester.runtime; //seconds
		let timeOutExceeded: boolean = false;
		let testDone: boolean = false;
		// setup a timer to flag timeOutExceeded when we have waited for 1.3*timeOut amount of time.
		// This test also assert that the test is done when this timeout expires.
		//
		setTimeout(() => {
			timeOutExceeded = true;
			assert(testDone, `test was not done even after ${1.3 * timeOut} seconds when runtime configured was ${timeOut} seconds`)
		}, timeOut * 1.3 * 1000);

		const stressifier = new StressifyTester();
		let retVal: StressResult = await stressifier.timeOutTest();
		testDone = true;
		debug(`test timeOutTest done, total invocations=${stressifier.t}`);
		debug(`test retVal is ${jsonDump(retVal)}`);
		assert(!timeOutExceeded, `timeOut of 1.3 times ${timeOut} seconds has been exceeded while executing the test`);
		assert(retVal.numPasses <= Stress.MaxIterations, `total invocations should less than ${Stress.MaxIterations}`);
	});
});
