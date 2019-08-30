/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import 'mocha';
import { getSuiteType, SuiteType } from '../utils';
import assert = require('assert');

const trace = require('debug')('unittest:utils:trace');

class UtilsTester {
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
}

suite('Utils automation unit tests', function () {
	//Environment Variable Tests
	//
	const absentValues = ['deleted', undefined, null, ''];
	let testId = 1;

	absentValues.forEach(valueDim => {
		test(`environmentVariable Test:${testId++}:: environmentVariable SuiteType is set to ##{${valueDim}}## should default to ${SuiteType.Integration}`, async function () {
			(new UtilsTester()).environmentVariableSuiteTypeTest({ 'environmentVariableValue': valueDim, 'expected': SuiteType.Integration });
		});
	});

	const envSuiteTypeTests = [
		{
			'testDescription': `environmentVariable Test:${testId++}::environmentVariable SuiteType set to random string which is not ${SuiteType.Stress} or ${SuiteType.Perf} should default to ${SuiteType.Integration}`,
			'environmentVariableValue': `${UtilsTester.randomString()}`,
			'expected': SuiteType.Integration
		},
		{
			'testDescription': `environmentVariable Test:${testId++}::environmentVariable SuiteType set to 'sTreSS' string should result in ${SuiteType.Stress}`,
			'environmentVariableValue': 'sTreSS', // Casing is mixed on purpose
			'expected': SuiteType.Stress
		},
		{
			'testDescription': `environmentVariable Test:${testId++}::environmentVariable SuiteType set to 'PErf' string should result in ${SuiteType.Perf}`,
			'environmentVariableValue': 'PErf', // Casing is mixed on purpose
			'expected': SuiteType.Perf
		},
	];

	envSuiteTypeTests.forEach(tst => {
		test(tst.testDescription, async function () {
			(new UtilsTester()).environmentVariableSuiteTypeTest(tst);
		});
	});
});
